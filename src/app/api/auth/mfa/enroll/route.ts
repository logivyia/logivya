import { NextResponse } from "next/server";
import { z } from "zod";

import { findActiveMfaCredential, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { createAndStoreMfaEnrollment, verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { verifyPassword } from "@/server/security/passwords";

const schema = z.object({
  password: z.string().min(1),
  currentCode: z.string().trim().min(6).max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await enforceOperationRateLimit({ scope: "mfa-enroll", subject: context.user.id, maxAttempts: 3, windowMs: 15 * 60_000, request });
    const passwordValid = await verifyPassword(context.user.passwordHash, body.password, process.env.PASSWORD_PEPPER ?? "");
    if (!passwordValid) return NextResponse.json({ error: "PASSWORD_CONFIRMATION_REQUIRED" }, { status: 401 });

    const activeCredential = await findActiveMfaCredential(context.user.id);
    if (activeCredential) {
      if (!body.currentCode) return NextResponse.json({ error: "RECENT_AUTHENTICATION_REQUIRED" }, { status: 428 });
      const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: body.currentCode, allowRecoveryCode: false });
      if (!verification.ok) return NextResponse.json({ error: verification.reason }, { status: 401 });
    }
    const enrollment = await createAndStoreMfaEnrollment(context.user.id, context.user.email);
    await recordMfaSecurityEvent({
      request,
      userId: context.user.id,
      companyId: context.company.id,
      type: "MFA_ENROLLMENT_STARTED",
      message: "Iki adimli dogrulama kurulumu baslatildi.",
    });
    return NextResponse.json(enrollment, { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MFA_ERROR";
    const status = code === "RATE_LIMITED" ? 429 : code === "TWO_FACTOR_SETUP_IN_PROGRESS" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
