import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import {
  listCompanyUsers,
  serializeCompanyMember,
} from "@/server/team/company-users";
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

export async function GET() {
  try {
    const { company, membership, user: actor } = await requireApiSession();
    const [users, access] = await Promise.all([
      listCompanyUsers(company.id),
      resolveMembershipAccess(company.id, actor.id),
    ]);
    assertTenantCapability(access, "tenant.members.read", "USER_MANAGEMENT_FORBIDDEN");
    const visibleUsers = membership.role === "OWNER"
      ? users
      : users.filter((member) => member.userId === actor.id || member.role === "OWNER");
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
    return NextResponse.json({
      users: visibleUsers.map((member) => serializeCompanyMember(member, actor.id)),
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
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: code },
      { status: code === "UNAUTHORIZED" ? 401 : 403 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user: actor } = await requireApiSession();
    const access = await resolveMembershipAccess(company.id, actor.id);
    assertTenantCapability(access, "tenant.members.create", "USER_MANAGEMENT_FORBIDDEN");
    const parsed = createDirectCompanyUserSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: directCompanyUserValidationCode(parsed.error) }, { status: 400 });

    const result = await createDirectCompanyUser(request, {
      companyId: company.id,
      actorUserId: actor.id,
      actorRole: membership.role,
    }, parsed.data);

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        mustChangePassword: result.user.mustChangePassword,
      },
      capacity: result.capacity,
    }, { status: 201 });
  } catch (error) {
    const code = directCompanyUserPublicErrorCode(error);
    const status = directCompanyUserErrorStatus(code);
    return NextResponse.json({ error: code, limit: (error as { limit?: number } | null)?.limit }, { status });
  }
}
