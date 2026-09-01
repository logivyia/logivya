import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import {
  companyInvitationErrorStatus,
  companyInvitationPublicErrorCode,
  revokeCompanyInvitation,
} from "@/server/team/company-invitations";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    await revokeCompanyInvitation(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id);
    return mobileSuccess({ success: true });
  } catch (error) {
    const code = companyInvitationPublicErrorCode(error);
    if (code === "INVITATION_REQUEST_FAILED") return mobileSafeError(error);
    return mobileError(code, "Invitation could not be revoked.", { status: companyInvitationErrorStatus(code) });
  }
}
