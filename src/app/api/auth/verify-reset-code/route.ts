import { NextResponse } from "next/server";
import { verifyResetCodeSchema } from "@/features/auth/schemas";
import { verifyPasswordResetCode } from "@/server/auth/password-reset";
import { logger } from "@/server/observability/logger";

function resetCodeError(result: string) {
  if (result === "EXPIRED") return "auth.resetCodeExpired";
  if (result === "LOCKED") return "auth.resetCodeLocked";
  return "auth.resetInvalidCode";
}

function resetCodeMessage(result: string) {
  if (result === "EXPIRED") return "Kodun süresi doldu. Lütfen yeni kod alın.";
  if (result === "LOCKED") return "Çok fazla hatalı deneme yapıldı. Lütfen yeni kod alın.";
  return "Kod hatalı veya geçersiz.";
}

export async function POST(request: Request) {
  try {
    const parsed = verifyResetCodeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "auth.resetInvalidCode" }, { status: 400 });
    const result = await verifyPasswordResetCode(request, parsed.data.identifier, parsed.data.code);
    return result === "OK"
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: resetCodeError(result), message: resetCodeMessage(result) }, { status: 400 });
  } catch (error) {
    logger.error("Password reset verification failed", error);
    return NextResponse.json({ error: "auth.resetInvalidCode" }, { status: 400 });
  }
}
