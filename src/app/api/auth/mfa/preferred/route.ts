import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import { setPreferredMfaMethod } from "@/server/security/mfa-policy";
import { verifySettingsPassword, verifyTotpSettingsFactor } from "@/server/security/mfa-settings";

const schema = z.object({ method: z.enum(["TOTP", "EMAIL_OTP"]), password: z.string().min(1), currentCode: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await verifySettingsPassword(context.user.id, context.user.passwordHash, body.password);
    await verifyTotpSettingsFactor(context.user.id, body.currentCode);
    return NextResponse.json({ ok: true, preferredMethod: await setPreferredMfaMethod(context.user.id, body.method) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
