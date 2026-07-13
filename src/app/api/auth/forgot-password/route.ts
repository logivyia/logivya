import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/features/auth/schemas";
import { getRequestLocale, getServerTranslator } from "@/i18n/server";
import {
  PasswordResetEmailDeliveryError,
  requestPasswordReset,
  RESET_EMAIL_CONFIGURATION_MESSAGE,
  RESET_EMAIL_DELIVERY_FAILED_MESSAGE,
  RESET_REQUEST_MESSAGE,
} from "@/server/auth/password-reset";
import { logger } from "@/server/observability/logger";

export async function POST(request: Request) {
  const { t } = await getServerTranslator(await getRequestLocale(request.headers.get("x-logivya-locale")));
  try {
    const parsed = forgotPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    await requestPasswordReset(request, parsed.data.identifier);
    return NextResponse.json({ ok: true, message: t(RESET_REQUEST_MESSAGE) });
  } catch (error) {
    if (error instanceof PasswordResetEmailDeliveryError) {
      logger.error("Password reset email was not sent", undefined, { errorCode: error.errorCode });
      if (error.errorCode.includes("CONFIGURATION_MISSING")) {
        return NextResponse.json(
          { error: "auth.emailServiceNotConfigured", message: t(RESET_EMAIL_CONFIGURATION_MESSAGE) },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "auth.resetEmailFailed", message: t(RESET_EMAIL_DELIVERY_FAILED_MESSAGE) },
        { status: 503 },
      );
    }
    logger.error("Password reset request failed", error);
    return NextResponse.json(
      { error: "auth.resetEmailFailed", message: t(RESET_EMAIL_DELIVERY_FAILED_MESSAGE) },
      { status: 503 },
    );
  }
}
