import { z } from "zod";

import { findActiveMfaCredential, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { createAndStoreMfaEnrollment, verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { verifyPassword } from "@/server/security/passwords";

const schema = z.object({
  password: z.string().min(1),
  currentCode: z.string().trim().min(6).max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({ scope: "mobile-mfa-enroll", subject: context.user.id, maxAttempts: 3, windowMs: 15 * 60_000, request });

    const passwordValid = await verifyPassword(context.user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? "");
    if (!passwordValid) return mobileError("PASSWORD_CONFIRMATION_REQUIRED", "Parolanızı doğrulayın.", { status: 401 });
    const activeCredential = await findActiveMfaCredential(context.user.id, "TOTP");
    if (activeCredential) {
      if (!parsed.data.currentCode) return mobileError("RECENT_AUTHENTICATION_REQUIRED", "Mevcut doğrulama kodunuzu girin.", { status: 428 });
      const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: parsed.data.currentCode, method: "TOTP", allowRecoveryCode: false });
      if (!verification.ok) return mobileError(verification.reason, "Doğrulama kodu geçersiz.", { status: 401 });
    }

    const enrollment = await createAndStoreMfaEnrollment(context.user.id, context.user.email);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_ENROLLMENT_STARTED", message: "Mobil iki adımlı doğrulama kurulumu başlatıldı." });
    return mobileSuccess(enrollment);
  } catch (error) {
    if (error instanceof Error && error.message === "TWO_FACTOR_SETUP_IN_PROGRESS") {
      return mobileError(error.message, "Devam eden bir Authenticator kurulumu var.", { status: 409 });
    }
    return mobileSafeError(error);
  }
}
