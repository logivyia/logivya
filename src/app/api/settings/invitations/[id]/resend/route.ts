import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { companyInvitationErrorStatus, companyInvitationPublicErrorCode, resendCompanyInvitation, serializeCompanyInvitation } from "@/server/team/company-invitations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    const result = await resendCompanyInvitation(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, id);
    return NextResponse.json({
      invitation: serializeCompanyInvitation(result.invitation),
      emailSent: result.emailSent,
    });
  } catch (error) {
    const code = companyInvitationPublicErrorCode(error);
    return NextResponse.json({ error: code }, { status: companyInvitationErrorStatus(code) });
  }
}
