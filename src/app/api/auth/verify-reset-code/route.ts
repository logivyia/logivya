import { NextResponse } from "next/server";
import { verifyResetCodeSchema } from "@/features/auth/schemas";
import { getRequestLocale, getServerTranslator, type Translator } from "@/i18n/server";
import { verifyPasswordResetCode } from "@/server/auth/password-reset";
import { logger } from "@/server/observability/logger";

function resetCodeError(result: string) {
  if (result === "EXPIRED") return "auth.resetCodeExpired";
  if (result === "LOCKED") return "auth.resetCodeLocked";
  return "auth.resetInvalidCode";
}

function resetCodeMessage(result: string, t: Translator) {
  if (result === "EXPIRED") return t("auth.resetCodeExpired");
  if (result === "LOCKED") return t("auth.resetCodeLocked");
  return t("auth.resetInvalidCode");
}

export async function POST(request: Request) {
  const { t } = await getServerTranslator(await getRequestLocale(request.headers.get("x-logivya-locale")));
  try {
    const parsed = verifyResetCodeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "auth.resetInvalidCode" }, { status: 400 });
    const result = await verifyPasswordResetCode(request, parsed.data.identifier, parsed.data.code);
    return result === "OK"
      ? NextResponse.json({ ok: true, message: t("auth.resetCodeVerified") })
      : NextResponse.json({ error: resetCodeError(result), message: resetCodeMessage(result, t) }, { status: 400 });
  } catch (error) {
    logger.error("Password reset verification failed", error);
    return NextResponse.json({ error: "auth.resetInvalidCode", message: t("auth.resetInvalidCode") }, { status: 400 });
  }
}
