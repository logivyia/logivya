import { z } from "zod";

import { recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { cancelPendingMfaEnrollment } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ setupToken: z.string().min(32).max(256).optional() });

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    await enforceOperationRateLimit({ scope: "mobile-mfa-enrollment-cancel", subject: context.user.id, maxAttempts: 5, windowMs: 15 * 60_000, request });
    await cancelPendingMfaEnrollment(context.user.id, parsed.data.setupToken);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_ENROLLMENT_CANCELLED", message: "Mobil iki adımlı doğrulama kurulumu iptal edildi." });
    return mobileSuccess({ ok: true });
  } catch (error) {
    return mobileSafeError(error);
  }
}
