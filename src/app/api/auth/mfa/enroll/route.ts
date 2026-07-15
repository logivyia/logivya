import { NextResponse } from "next/server";

import { recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { createAndStoreMfaEnrollment } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    await enforceOperationRateLimit({ scope: "mfa-enroll", subject: context.user.id, maxAttempts: 3, windowMs: 15 * 60_000, request });
    const enrollment = await createAndStoreMfaEnrollment(context.user.id, context.user.email);
    await recordMfaSecurityEvent({
      request,
      userId: context.user.id,
      companyId: context.company.id,
      type: "MFA_ENROLLMENT_STARTED",
      message: "Iki adimli dogrulama kurulumu baslatildi.",
    });
    return NextResponse.json(enrollment);
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    return NextResponse.json({ error: code }, { status: code === "RATE_LIMITED" ? 429 : 400 });
  }
}
