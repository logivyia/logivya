import { forgotPasswordSchema } from "@/features/auth/schemas";
import {
  PasswordResetEmailDeliveryError,
  requestPasswordReset,
  RESET_EMAIL_CONFIGURATION_MESSAGE,
  RESET_EMAIL_DELIVERY_FAILED_MESSAGE,
  RESET_REQUEST_MESSAGE,
} from "@/server/auth/password-reset";
import { clientIp, enforceMobileRateLimit } from "@/server/mobile/rate-limit";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";

export async function POST(request: Request) {
  try {
    enforceMobileRateLimit(`mobile-forgot:${clientIp(request)}`, 10, 60 * 60_000);
    const parsed = forgotPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    await requestPasswordReset(request, parsed.data.identifier);
    return mobileSuccess({ message: RESET_REQUEST_MESSAGE });
  } catch (error) {
    if (error instanceof PasswordResetEmailDeliveryError) {
      if (error.errorCode.includes("CONFIGURATION_MISSING")) return mobileError("CONFIGURATION_ERROR", RESET_EMAIL_CONFIGURATION_MESSAGE, { status: 503 });
      return mobileError("EMAIL_DELIVERY_FAILED", RESET_EMAIL_DELIVERY_FAILED_MESSAGE, { status: 503 });
    }
    return mobileSafeError(error, RESET_EMAIL_DELIVERY_FAILED_MESSAGE);
  }
}
