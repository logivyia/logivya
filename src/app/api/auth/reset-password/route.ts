import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/features/auth/schemas";
import { completePasswordReset } from "@/server/auth/password-reset";
import { logger } from "@/server/observability/logger";

export async function POST(request: Request) {
  try {
    const parsed = resetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "validation.password", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const completed = await completePasswordReset(request, parsed.data.identifier, parsed.data.code, parsed.data.password);
    return completed
      ? NextResponse.json({ ok: true, message: "Şifreniz başarıyla güncellendi." })
      : NextResponse.json({ error: "auth.resetInvalidCode", message: "Kod hatalı, süresi dolmuş veya kullanılmış." }, { status: 400 });
  } catch (error) {
    logger.error("Password reset completion failed", error);
    return NextResponse.json({ error: "errors.generic" }, { status: 500 });
  }
}
