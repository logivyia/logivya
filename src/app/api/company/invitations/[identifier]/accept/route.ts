import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession, requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { acceptCompanyInvitation, companyInvitationErrorStatus, declineCompanyInvitation, findPendingInvitation } from "@/server/team/company-invitations";

const actionSchema = z.object({ action: z.enum(["ACCEPT", "DECLINE"]).default("ACCEPT") });

export async function GET(_request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  const invitation = await findPendingInvitation(identifier);
  if (!invitation) return NextResponse.json({ error: "INVITATION_INVALID" }, { status: 404 });
  return NextResponse.json({
    invitation: {
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      company: invitation.company,
      expiresAt: invitation.expiresAt,
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  try {
    const { identifier } = await params;
    const { session, user } = await requireApiSession();
    await enforceOperationRateLimit({
      scope: "company-invitation-accept",
      subject: `${user.id}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`,
      maxAttempts: 12,
      windowMs: 60 * 60 * 1000,
      request,
    });
    const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });

    if (parsed.data.action === "DECLINE") {
      const invitation = await declineCompanyInvitation({ token: identifier, userId: user.id, email: user.email });
      return NextResponse.json({ ok: true, status: "DECLINED", invitationId: invitation.id });
    }

    const result = await acceptCompanyInvitation({ token: identifier, userId: user.id, email: user.email }, request);
    await createSession(user.id, result.companyId, request);
    await prisma.userSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAuditLog(request, {
      companyId: result.companyId,
      userId: user.id,
      action: "company.invitation.accepted",
      entityType: "CompanyInvitation",
      entityId: result.invitation.id,
      after: { role: result.membership.role },
    });
    return NextResponse.json({ ok: true, status: "ACCEPTED", companyId: result.companyId, role: result.membership.role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "errors.generic";
    const status = companyInvitationErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}
