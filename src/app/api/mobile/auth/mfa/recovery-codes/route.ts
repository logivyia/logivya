import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { replaceRecoveryCodes, verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { verifyPassword } from "@/server/security/passwords";

const schema = z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({ scope: "mobile-mfa-recovery-codes-regenerate", subject: context.user.id, maxAttempts: 5, windowMs: 30 * 60_000, request });
    const passwordValid = await verifyPassword(context.user.passwordHash, parsed.data.password, process.env.PASSWORD_PEPPER ?? "");
    if (!passwordValid) return mobileError("PASSWORD_CONFIRMATION_REQUIRED", "Parolanızı doğrulayın.", { status: 401 });
    const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: parsed.data.code, allowRecoveryCode: false });
    if (!verification.ok) return mobileError(verification.reason, "Doğrulama kodu geçersiz.", { status: 401 });
    const recoveryCodes = await replaceRecoveryCodes(context.user.id);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_RECOVERY_CODES_REGENERATED", message: "MFA kurtarma kodları mobil uygulamadan yenilendi.", severity: "MEDIUM" });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_recovery_codes_regenerated", title: "Kurtarma kodları yenilendi", message: "Önceki kurtarma kodları artık kullanılamaz." });
    return mobileSuccess({ recoveryCodes });
  } catch (error) {
    return mobileSafeError(error);
  }
}
