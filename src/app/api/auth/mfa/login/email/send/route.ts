import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { MFA_CHALLENGE_COOKIE, sendEmailOtpForChallenge } from "@/server/auth/mfa-challenge";

export async function POST() {
  try {
    const token = (await cookies()).get(MFA_CHALLENGE_COOKIE)?.value;
    if (!token) throw new Error("MFA_CHALLENGE_INVALID");
    const result = await sendEmailOtpForChallenge({ token, channel: "WEB" });
    return NextResponse.json({ ...result, expiresAt: result.expiresAt.toISOString() }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
