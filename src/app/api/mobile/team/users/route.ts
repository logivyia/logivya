import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import {
  listCompanyUsers,
  serializeCompanyMember,
} from "@/server/team/company-users";
import {
  createCompanyInvitation,
  createCompanyInvitationSchema,
  getCompanySeatUsage,
  listCompanyInvitations,
  serializeCompanyInvitation,
} from "@/server/team/company-invitations";

function canManageUsers(role: string) {
  return role === "OWNER";
}

function teamError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "FORBIDDEN") return mobileError("FORBIDDEN", "Kullanici yonetimi icin yetkiniz yok.", { status: 403 });
    if (error.message === "SEAT_LIMIT_REACHED") {
      return mobileError("SEAT_LIMIT_REACHED", "Planınızdaki kullanılabilir ekip koltuğu dolu.", {
        status: 409,
        details: { limit: (error as Error & { limit?: number }).limit },
      });
    }
    if (error.message === "RATE_LIMITED") {
      return mobileError("RATE_LIMITED", "Çok fazla davet isteği gönderdiniz. Lütfen daha sonra tekrar deneyin.", { status: 429 });
    }
    if (error.message === "users.alreadyMember") {
      return mobileError("ALREADY_MEMBER", "Bu kullanıcı zaten şirket ekibinde.", { status: 409 });
    }
  }
  return mobileSafeError(error, "Kullanici islemi tamamlanamadi.");
}

export async function GET(request: Request) {
  try {
    const { company, membership } = await requireMobileAuth(request);
    if (!canManageUsers(membership.role)) return mobileError("FORBIDDEN", "Kullanici listesini gorme yetkiniz yok.", { status: 403 });

    const [users, invitations, seatUsage] = await Promise.all([
      listCompanyUsers(company.id),
      listCompanyInvitations(company.id),
      getCompanySeatUsage(company.id),
    ]);
    return mobileSuccess({
      users: users.map(serializeCompanyMember),
      invitations: invitations.map(serializeCompanyInvitation),
      seatUsage,
    });
  } catch (error) {
    return teamError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    const parsed = createCompanyInvitationSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);

    const result = await createCompanyInvitation(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, parsed.data);

    return mobileSuccess({
      invitation: serializeCompanyInvitation(result.invitation),
      emailSent: result.emailSent,
    }, { status: 201 });
  } catch (error) {
    return teamError(error);
  }
}
