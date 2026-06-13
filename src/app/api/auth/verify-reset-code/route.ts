import { NextResponse } from "next/server";
import { verifyResetCodeSchema } from "@/features/auth/schemas";
import { verifyPasswordResetCode } from "@/server/auth/password-reset";
import { logger } from "@/server/observability/logger";

export async function POST(request: Request) {
  try {
    const parsed = verifyResetCodeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "auth.resetInvalidCode" }, { status: 400 });
    const verified = await verifyPasswordResetCode(request, parsed.data.identifier, parsed.data.code);
    return verified
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "auth.resetInvalidCode" }, { status: 400 });
  } catch (error) {
    logger.error("Password reset verification failed", error);
    return NextResponse.json({ error: "auth.resetInvalidCode" }, { status: 400 });
  }
}
