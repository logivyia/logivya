import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { listCompanyUsers, serializeCompanyMember } from "@/server/team/company-users";
import {
  createDirectCompanyUser,
  createDirectCompanyUserSchema,
  directCompanyUserErrorStatus,
  directCompanyUserPublicErrorCode,
  directCompanyUserValidationCode,
} from "@/server/team/direct-company-users";
import {
  assertTenantCapability,
  resolveMembershipAccess,
  serializeMembershipAccess,
} from "@/server/team/membership-lifecycle";

function teamError(error: unknown) {
  const code = directCompanyUserPublicErrorCode(error);
  if (code === "USER_OPERATION_FAILED") {
    return mobileSafeError(error, "User operation could not be completed.");
  }
  return mobileError(code, "User operation could not be completed.", {
    status: directCompanyUserErrorStatus(code),
    details: { limit: (error as Error & { limit?: number } | null)?.limit },
  });
}

export async function GET(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const [users, access] = await Promise.all([
      listCompanyUsers(company.id),
      resolveMembershipAccess(company.id, user.id),
    ]);
    assertTenantCapability(access, "tenant.members.read", "USER_MANAGEMENT_FORBIDDEN");
    const visibleUsers = membership.role === "OWNER"
      ? users
      : users.filter((member) => member.userId === user.id || member.role === "OWNER");
    const accountLimit = access.plan?.accountLimit ?? 0;
    const occupiedAccounts = users.length;
    const seatUsage = {
      used: occupiedAccounts,
      limit: accountLimit,
      available: Math.max(0, accountLimit - occupiedAccounts),
      activeMembers: users.filter((member) => member.status === "ACTIVE").length,
      suspendedMembers: users.filter((member) => member.status === "SUSPENDED").length,
      legacyInvitedMembers: users.filter((member) => member.status === "INVITED").length,
      pendingInvitations: users.filter(
        (member) => member.lifecycleState === "PENDING_ACTIVATION",
      ).length,
      planSlug: access.plan?.code ?? "",
      planName: access.plan?.name ?? "-",
    };
    return mobileSuccess({
      users: visibleUsers.map((member) => serializeCompanyMember(member, user.id)),
      seatUsage,
      occupiedAccounts: seatUsage.used,
      accountLimit: seatUsage.limit,
      availableAccounts: seatUsage.available,
      requesterPermissions: {
        canCreateUsers: access.capabilities["tenant.members.create"],
        canSuspendUsers: false,
        canRemoveUsers: access.capabilities["tenant.members.manage_pending"],
        canResetTemporaryPasswords: access.capabilities["tenant.members.manage_pending"],
      },
      membershipAccess: serializeMembershipAccess(access),
    });
  } catch (error) {
    return teamError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const access = await resolveMembershipAccess(company.id, user.id);
    assertTenantCapability(access, "tenant.members.create", "USER_MANAGEMENT_FORBIDDEN");
    const parsed = createDirectCompanyUserSchema.safeParse(await request.json());
    if (!parsed.success) {
      const code = directCompanyUserValidationCode(parsed.error);
      return mobileError(code, "User fields are invalid.", { status: 400 });
    }

    const result = await createDirectCompanyUser(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, parsed.data);

    return mobileSuccess({
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        mustChangePassword: result.user.mustChangePassword,
      },
      capacity: result.capacity,
    }, { status: 201 });
  } catch (error) {
    return teamError(error);
  }
}
