import { NextResponse } from "next/server";
import { z } from "zod";

import { recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { cancelPendingMfaEnrollment } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

const schema = z.object({ setupToken: z.string().min(32).max(256).optional() });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await enforceOperationRateLimit({ scope: "mfa-enrollment-cancel", subject: context.user.id, maxAttempts: 5, windowMs: 15 * 60_000, request });
    await cancelPendingMfaEnrollment(context.user.id, body.setupToken);
    await recordMfaSecurityEvent({
      request,
      userId: context.user.id,
      companyId: context.company.id,
      type: "MFA_ENROLLMENT_CANCELLED",
      message: "İki adımlı doğrulama kurulumu iptal edildi.",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    return NextResponse.json({ error: code }, { status: code === "RATE_LIMITED" ? 429 : 400 });
  }
}
