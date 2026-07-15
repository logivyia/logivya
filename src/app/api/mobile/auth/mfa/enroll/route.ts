import { recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { createAndStoreMfaEnrollment } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export async function POST(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    await enforceOperationRateLimit({ scope: "mobile-mfa-enroll", subject: context.user.id, maxAttempts: 3, windowMs: 15 * 60_000, request });
    const enrollment = await createAndStoreMfaEnrollment(context.user.id, context.user.email);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_ENROLLMENT_STARTED", message: "Mobil MFA kurulumu baslatildi." });
    return mobileSuccess(enrollment);
  } catch (error) {
    return mobileSafeError(error);
  }
}
