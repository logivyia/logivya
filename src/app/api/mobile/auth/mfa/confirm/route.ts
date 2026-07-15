import { z } from "zod";

import { recordMfaSecurityEvent, revokeUserSecuritySessions } from "@/server/auth/mfa-challenge";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { activateMfaCredential, verifyAndConsumeMfaCode } from "@/server/security/mfa";

const schema = z.object({ code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: parsed.data.code, allowUnverifiedCredential: true });
    if (!verification.ok) return mobileError(verification.reason, "Dogrulama kodu gecersiz.", { status: 401 });
    await activateMfaCredential(context.user.id, verification.credentialId);
    await prisma.mobileDeviceSession.update({ where: { id: context.sessionId }, data: { mfaVerifiedAt: new Date() } });
    await revokeUserSecuritySessions(context.user.id, { mobileSessionId: context.sessionId });
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_ENABLED", message: "Iki adimli dogrulama mobil uygulamadan etkinlestirildi." });
    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
