import { NextResponse } from "next/server";
import { z } from "zod";

import { recordMfaSecurityEvent, revokeUserSecuritySessions } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { activateMfaCredential, verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await enforceOperationRateLimit({ scope: "mfa-enrollment-verify", subject: context.user.id, maxAttempts: 5, windowMs: 10 * 60_000, request });
    const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: body.code, allowUnverifiedCredential: true });
    if (!verification.ok) {
      await recordMfaSecurityEvent({
        request,
        userId: context.user.id,
        companyId: context.company.id,
        type: "MFA_ENROLLMENT_FAILED",
        message: "Iki adimli dogrulama kurulum kodu reddedildi.",
        severity: "MEDIUM",
        metadata: { reason: verification.reason },
      });
      return NextResponse.json({ error: verification.reason }, { status: 401 });
    }
    await activateMfaCredential(context.user.id, verification.credentialId);
    await prisma.userSession.update({ where: { id: context.session.id }, data: { mfaVerifiedAt: new Date() } });
    await revokeUserSecuritySessions(context.user.id, { webSessionId: context.session.id });
    await recordMfaSecurityEvent({
      request,
      userId: context.user.id,
      companyId: context.company.id,
      type: "MFA_ENABLED",
      message: "Iki adimli dogrulama etkinlestirildi.",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    return NextResponse.json({ error: code }, { status: code === "RATE_LIMITED" ? 429 : 400 });
  }
}
