import { NextResponse } from "next/server";
import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { confirmEmailMfaEnrollment } from "@/server/security/mfa-email";

const schema = z.object({ setupToken: z.string().min(32).max(256), code: z.string().regex(/^\d{6}$/u) });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    const result = await confirmEmailMfaEnrollment({ userId: context.user.id, setupToken: body.setupToken, code: body.code, channel: "WEB" });
    if (!result.ok) {
      const isLocked = "locked" in result && result.locked;
      return NextResponse.json({ error: result.reason }, { status: isLocked ? 429 : 401 });
    }
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_EMAIL_ENABLED", message: "E-posta ile doğrulama etkinleştirildi." });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_email_enabled", title: "E-posta doğrulaması etkin", message: "E-posta ile doğrulama hesabınızda etkinleştirildi." });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
