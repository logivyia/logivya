import { NextResponse } from "next/server";
import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent, revokeUserSecuritySessions } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { verifyPendingMfaEnrollment } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ setupToken: z.string().min(32).max(256), code: z.string().trim().regex(/^\d{6}$/u) });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await enforceOperationRateLimit({ scope: "mfa-enrollment-verify", subject: context.user.id, maxAttempts: 5, windowMs: 10 * 60_000, request });
    const verification = await verifyPendingMfaEnrollment({ userId: context.user.id, setupToken: body.setupToken, code: body.code });
    if (!verification.ok) {
      await recordMfaSecurityEvent({
        request,
        userId: context.user.id,
        companyId: context.company.id,
        type: "MFA_ENROLLMENT_FAILED",
        message: "İki adımlı doğrulama kurulum kodu reddedildi.",
        severity: "MEDIUM",
        metadata: { reason: verification.reason },
      });
      return NextResponse.json({ error: verification.reason }, { status: 401 });
    }
    await prisma.userSession.update({ where: { id: context.session.id }, data: { mfaVerifiedAt: new Date() } });
    await revokeUserSecuritySessions(context.user.id, { webSessionId: context.session.id });
    await recordMfaSecurityEvent({
      request,
      userId: context.user.id,
      companyId: context.company.id,
      type: "MFA_ENABLED",
      message: "İki adımlı doğrulama etkinleştirildi.",
    });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_enabled", title: "İki adımlı doğrulama etkin", message: "Authenticator doğrulaması hesabınızı korumak için etkinleştirildi." });
    return NextResponse.json(
      { ok: true, recoveryCodes: verification.recoveryCodes },
      { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    return NextResponse.json({ error: code }, { status: code === "RATE_LIMITED" ? 429 : 400 });
  }
}
