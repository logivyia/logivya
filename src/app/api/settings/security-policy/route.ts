import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { normalizeMfaPolicy } from "@/server/security/mfa-policy";
import { verifySettingsPassword, verifyTotpSettingsFactor } from "@/server/security/mfa-settings";

const schema = z.object({ policy: z.enum(["NONE", "REQUIRE_ANY_MFA", "REQUIRE_TOTP", "REQUIRE_TOTP_FOR_ADMINS"]), password: z.string().min(1), currentCode: z.string().trim().min(6).max(64).optional() });

export async function GET() {
  const context = await requireApiSession();
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return NextResponse.json({ policy: normalizeMfaPolicy(context.company.mfaPolicy) });
}

export async function PATCH(request: Request) {
  try {
    const context = await requireApiSession();
    if (context.membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const body = schema.parse(await request.json());
    await verifySettingsPassword(context.user.id, context.user.passwordHash, body.password);
    await verifyTotpSettingsFactor(context.user.id, body.currentCode, true);
    const now = new Date();
    await prisma.$transaction([
      prisma.company.update({ where: { id: context.company.id }, data: { mfaPolicy: body.policy } }),
      prisma.userSession.updateMany({ where: { companyId: context.company.id, id: { not: context.session.id }, revokedAt: null }, data: { revokedAt: now } }),
      prisma.mobileDeviceSession.updateMany({ where: { companyId: context.company.id, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    return NextResponse.json({ ok: true, policy: body.policy });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_POLICY_ERROR" }, { status: 400 });
  }
}
