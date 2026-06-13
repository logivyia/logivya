import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/features/auth/schemas";
import { requestPasswordReset, RESET_REQUEST_MESSAGE } from "@/server/auth/password-reset";
import { logger } from "@/server/observability/logger";

export async function POST(request: Request) {
  try {
    const parsed = forgotPasswordSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    await requestPasswordReset(request, parsed.data.identifier);
    return NextResponse.json({ ok: true, message: RESET_REQUEST_MESSAGE });
  } catch (error) {
    logger.error("Password reset request failed", error);
    return NextResponse.json({ ok: true, message: RESET_REQUEST_MESSAGE });
  }
}
