import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import {
  directCompanyUserErrorStatus,
  directCompanyUserPublicErrorCode,
  resetCompanyUserTemporaryPassword,
  resetCompanyUserTemporaryPasswordSchema,
} from "@/server/team/direct-company-users";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireApiSession();
    const parsed = resetCompanyUserTemporaryPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "PASSWORD_REQUIRED" }, { status: 400 });
    await resetCompanyUserTemporaryPassword(request, {
      companyId: company.id,
      actorUserId: user.id,
      actorRole: membership.role,
    }, (await params).id, parsed.data.temporaryPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = directCompanyUserPublicErrorCode(error);
    return NextResponse.json({ error: code }, { status: directCompanyUserErrorStatus(code) });
  }
}
