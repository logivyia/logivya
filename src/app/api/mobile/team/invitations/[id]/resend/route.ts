import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { companyInvitationErrorStatus, resendCompanyInvitation, serializeCompanyInvitation } from "@/server/team/company-invitations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    const result = await resendCompanyInvitation(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id);
    return mobileSuccess({
      invitation: serializeCompanyInvitation(result.invitation),
      emailSent: result.emailSent,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return mobileError("NOT_FOUND", "Bekleyen davet bulunamadı.", { status: 404 });
    if (error instanceof Error && ["FORBIDDEN", "RATE_LIMITED"].includes(error.message)) {
      return mobileError(error.message, error.message === "RATE_LIMITED" ? "Davet kısa süre önce gönderildi. Lütfen daha sonra tekrar deneyin." : "Bu işlem için yetkiniz yok.", { status: companyInvitationErrorStatus(error.message) });
    }
    return mobileSafeError(error);
  }
}
