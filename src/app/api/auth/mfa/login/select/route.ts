import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { MFA_CHALLENGE_COOKIE } from "@/server/auth/mfa-challenge";
import { chooseMfaChallengeMethod } from "@/server/security/mfa-login-method";

const schema = z.object({ method: z.enum(["TOTP", "EMAIL_OTP"]) });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const token = (await cookies()).get(MFA_CHALLENGE_COOKIE)?.value;
    if (!token) throw new Error("MFA_CHALLENGE_INVALID");
    const result = await chooseMfaChallengeMethod({ token, channel: "WEB", method: body.method });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
