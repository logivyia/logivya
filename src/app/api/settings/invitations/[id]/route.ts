import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { companyInvitationErrorStatus, companyInvitationPublicErrorCode, revokeCompanyInvitation } from "@/server/team/company-invitations";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    await revokeCompanyInvitation(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = companyInvitationPublicErrorCode(error);
    return NextResponse.json({ error: code }, { status: companyInvitationErrorStatus(code) });
  }
}
