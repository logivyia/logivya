import { NextResponse } from "next/server";
import { z } from "zod";

import { recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { startEmailMfaEnrollment } from "@/server/security/mfa-email";
import { verifySettingsPassword, verifyTotpSettingsFactor } from "@/server/security/mfa-settings";

const schema = z.object({ password: z.string().min(1), currentCode: z.string().trim().min(6).max(64).optional() });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await verifySettingsPassword(context.user.id, context.user.passwordHash, body.password);
    await verifyTotpSettingsFactor(context.user.id, body.currentCode, true);
    const enrollment = await startEmailMfaEnrollment({ userId: context.user.id, companyId: context.company.id, channel: "WEB", request });
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_EMAIL_ENROLLMENT_STARTED", message: "E-posta ile doğrulama kurulumu başlatıldı." });
    return NextResponse.json(enrollment, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
