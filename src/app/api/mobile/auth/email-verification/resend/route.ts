import { issueEmailVerification } from "@/server/auth/email-verification";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export async function POST(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    if (user.emailVerifiedAt) return mobileSuccess({ alreadyVerified: true });
    await enforceOperationRateLimit({ scope: "mobile-email-verification-resend", subject: user.id, maxAttempts: 3, windowMs: 60 * 60_000, request });
    return mobileSuccess(await issueEmailVerification(request, { userId: user.id, companyId: company.id, email: user.email }));
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") return mobileError("RATE_LIMITED", "Doğrulama e-postası kısa süre önce gönderildi.", { status: 429 });
    return mobileSafeError(error);
  }
}
