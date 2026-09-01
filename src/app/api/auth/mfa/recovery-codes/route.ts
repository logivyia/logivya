import { NextResponse } from "next/server";
import { z } from "zod";

import { notifyMfaSecurityChange, recordMfaSecurityEvent } from "@/server/auth/mfa-challenge";
import { requireApiSession } from "@/server/auth/session";
import { replaceRecoveryCodes, verifyAndConsumeMfaCode } from "@/server/security/mfa";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { verifyPassword } from "@/server/security/passwords";

const schema = z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(64) });

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    const body = schema.parse(await request.json());
    await enforceOperationRateLimit({ scope: "mfa-recovery-codes-regenerate", subject: context.user.id, maxAttempts: 5, windowMs: 30 * 60_000, request });
    const passwordValid = await verifyPassword(context.user.passwordHash, body.password, process.env.PASSWORD_PEPPER ?? "");
    if (!passwordValid) return NextResponse.json({ error: "PASSWORD_CONFIRMATION_REQUIRED" }, { status: 401 });
    const verification = await verifyAndConsumeMfaCode({ userId: context.user.id, code: body.code, allowRecoveryCode: false });
    if (!verification.ok) return NextResponse.json({ error: verification.reason }, { status: 401 });
    const recoveryCodes = await replaceRecoveryCodes(context.user.id);
    await recordMfaSecurityEvent({ request, userId: context.user.id, companyId: context.company.id, type: "MFA_RECOVERY_CODES_REGENERATED", message: "MFA kurtarma kodları yenilendi.", severity: "MEDIUM" });
    await notifyMfaSecurityChange({ userId: context.user.id, companyId: context.company.id, type: "security.mfa_recovery_codes_regenerated", title: "Kurtarma kodları yenilendi", message: "Önceki kurtarma kodları artık kullanılamaz." });
    return NextResponse.json({ recoveryCodes }, { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
