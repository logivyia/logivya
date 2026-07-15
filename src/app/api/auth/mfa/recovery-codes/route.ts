import { NextResponse } from "next/server";
import { z } from "zod";

import { recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { replaceRecoveryCodes, verifyAndConsumeMfaCode } from "@/server/security/mfa";

const schema = z.object({ code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: body.code });
    if (!verification.ok) return NextResponse.json({ error: verification.reason }, { status: 401 });
    const recoveryCodes = await replaceRecoveryCodes(context.user.id);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_RECOVERY_CODES_REGENERATED", message: "MFA kurtarma kodlari yenilendi.", severity: "MEDIUM" });
    return NextResponse.json({ recoveryCodes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
