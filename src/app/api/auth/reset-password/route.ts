import { NextResponse } from "next/server";
import { authPasswordErrorCode, resetPasswordSchema } from "@/features/auth/schemas";
import { getRequestLocale, getServerTranslator } from "@/i18n/server";
import { completePasswordReset } from "@/server/auth/password-reset";
import { logger } from "@/server/observability/logger";

export async function POST(request: Request) {
  const { t } = await getServerTranslator(await getRequestLocale(request.headers.get("x-logivya-locale")));
  try {
    const parsed = resetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({
        error: authPasswordErrorCode(parsed.error) ?? "VALIDATION_ERROR",
        fields: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const completed = await completePasswordReset(request, parsed.data.identifier, parsed.data.code, parsed.data.password);
    return completed
      ? NextResponse.json({ ok: true, message: t("api.success.passwordUpdated") })
      : NextResponse.json({ error: "auth.resetInvalidCode", message: t("auth.resetInvalidCode") }, { status: 400 });
  } catch (error) {
    logger.error("Password reset completion failed", error);
    return NextResponse.json({ error: "errors.generic" }, { status: 500 });
  }
}
