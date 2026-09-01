import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent, revokeUserSecuritySessions } from "@/server/auth/mfa-challenge";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { verifyPendingMfaEnrollment } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ setupToken: z.string().min(32).max(256), code: z.string().trim().regex(/^\d{6}$/u) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({ scope: "mobile-mfa-enrollment-verify", subject: context.user.id, maxAttempts: 7, windowMs: 10 * 60_000, request });
    const verification = await verifyPendingMfaEnrollment({ userId: context.user.id, setupToken: parsed.data.setupToken, code: parsed.data.code });
    if (!verification.ok) return mobileError(verification.reason, "Doğrulama kodu geçersiz.", { status: verification.reason === "TOO_MANY_TOTP_ATTEMPTS" ? 429 : 401 });
    await prisma.mobileDeviceSession.update({ where: { id: context.sessionId }, data: { mfaVerifiedAt: new Date() } });
    await revokeUserSecuritySessions(context.user.id, { mobileSessionId: context.sessionId });
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_ENABLED", message: "İki adımlı doğrulama mobil uygulamadan etkinleştirildi." });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_enabled", title: "İki adımlı doğrulama etkin", message: "Authenticator doğrulaması hesabınızı korumak için etkinleştirildi." });
    return mobileSuccess({ ok: true, recoveryCodes: verification.recoveryCodes });
  } catch (error) {
    return mobileSafeError(error);
  }
}
