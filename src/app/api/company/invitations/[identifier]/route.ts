import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { revokeCompanyInvitation } from "@/server/team/company-invitations";

export async function DELETE(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  try {
    const { identifier } = await params;
    const { company, membership, user } = await requireApiSession();
    await revokeCompanyInvitation(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, identifier);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "NOT_FOUND" ? 404 : 403 });
  }
}
