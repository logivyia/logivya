import { NextResponse } from "next/server";

import { issueEmailVerification } from "@/server/auth/email-verification";
import { requireApiSession } from "@/server/auth/session";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export async function POST(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
    await enforceOperationRateLimit({ scope: "email-verification-resend", subject: user.id, maxAttempts: 3, windowMs: 60 * 60_000, request });
    return NextResponse.json({ ok: true, ...(await issueEmailVerification(request, { userId: user.id, companyId: company.id, email: user.email })) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EMAIL_VERIFICATION_FAILED";
    return NextResponse.json({ error: code }, { status: code === "RATE_LIMITED" ? 429 : 401 });
  }
}
