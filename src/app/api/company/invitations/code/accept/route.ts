import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession, requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { acceptCompanyInvitation, companyInvitationErrorStatus } from "@/server/team/company-invitations";

const schema = z.object({ code: z.string().trim().min(16).max(32) });

export async function POST(request: Request) {
  try {
    const { session, user } = await requireApiSession();
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "INVITATION_INVALID" }, { status: 400 });

    await enforceOperationRateLimit({
      scope: "company-invitation-code-accept",
      subject: `${user.id}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`,
      maxAttempts: 12,
      windowMs: 60 * 60 * 1000,
      request,
    });

    const result = await acceptCompanyInvitation({ code: parsed.data.code, userId: user.id, email: user.email }, request);
    await createSession(user.id, result.companyId, request);
    await prisma.userSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditLog(request, {
      companyId: result.companyId,
      userId: user.id,
      action: "company.invitation.code_accepted",
      entityType: "CompanyInvitation",
      entityId: result.invitation.id,
      after: { role: result.membership.role },
    });

    return NextResponse.json({ ok: true, status: "ACCEPTED", companyId: result.companyId, role: result.membership.role });
  } catch (error) {
    const code = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: code }, { status: companyInvitationErrorStatus(code) });
  }
}
