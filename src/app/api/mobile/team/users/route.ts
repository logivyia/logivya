import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import {
  inviteCompanyUser,
  inviteCompanyUserSchema,
  listCompanyUsers,
  serializeCompanyMember,
} from "@/server/team/company-users";

function canManageUsers(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

function teamError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "FORBIDDEN") return mobileError("FORBIDDEN", "Kullanici yonetimi icin yetkiniz yok.", { status: 403 });
    if (error.message === "users.planLimit") {
      return mobileError("SUBSCRIPTION_LOCKED", "Planiniz daha fazla ekip kullanicisi davet etmeye uygun degil.", {
        status: 403,
        details: { limit: (error as Error & { limit?: number }).limit },
      });
    }
  }
  return mobileSafeError(error, "Kullanici islemi tamamlanamadi.");
}

export async function GET(request: Request) {
  try {
    const { company, membership } = await requireMobileAuth(request);
    if (!canManageUsers(membership.role)) return mobileError("FORBIDDEN", "Kullanici listesini gorme yetkiniz yok.", { status: 403 });

    const users = await listCompanyUsers(company.id);
    return mobileSuccess({ users: users.map(serializeCompanyMember) });
  } catch (error) {
    return teamError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const parsed = inviteCompanyUserSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    const member = await inviteCompanyUser(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, parsed.data);

    return mobileSuccess({ member: serializeCompanyMember(member) }, { status: 201 });
  } catch (error) {
    return teamError(error);
  }
}
