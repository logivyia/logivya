import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import {
  companyInvitationErrorStatus,
  companyInvitationPublicErrorCode,
  resendCompanyInvitation,
  serializeCompanyInvitation,
} from "@/server/team/company-invitations";

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
    const code = companyInvitationPublicErrorCode(error);
    if (code === "INVITATION_REQUEST_FAILED") return mobileSafeError(error);
    return mobileError(code, "Invitation could not be resent.", { status: companyInvitationErrorStatus(code) });
  }
}
