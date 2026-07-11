import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { revokeCompanyInvitation } from "@/server/team/company-invitations";

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
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return mobileError("FORBIDDEN", "Davet iptal etme yetkiniz yok.", { status: 403 });
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return mobileError("NOT_FOUND", "Bekleyen davet bulunamadi.", { status: 404 });
    }
    return mobileSafeError(error);
  }
}
