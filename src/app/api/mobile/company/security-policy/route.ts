import { z } from "zod";

import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { readMobileJson } from "@/server/mobile/request-json";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { normalizeMfaPolicy } from "@/server/security/mfa-policy";
import { verifySettingsPassword, verifyTotpSettingsFactor } from "@/server/security/mfa-settings";

const schema = z.object({ policy: z.enum(["NONE", "REQUIRE_ANY_MFA", "REQUIRE_TOTP", "REQUIRE_TOTP_FOR_ADMINS"]), password: z.string().min(1), currentCode: z.string().trim().min(6).max(64).optional() });

export async function GET(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    if (context.membership.role !== "OWNER") return mobileError("FORBIDDEN", "Bu ayarı yalnızca çalışma alanı sahibi değiştirebilir.", { status: 403 });
    return mobileSuccess({ policy: normalizeMfaPolicy(context.company.mfaPolicy) });
  } catch (error) {
    return mobileSafeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireMobileAuth(request);
    if (context.membership.role !== "OWNER") return mobileError("FORBIDDEN", "Bu ayarı yalnızca çalışma alanı sahibi değiştirebilir.", { status: 403 });
    const json = await readMobileJson(request);
    if (!json.ok) return json.response;
    const body = schema.safeParse(json.data);
    if (!body.success) return mobileValidationError(body.error);
    await verifySettingsPassword(context.user.id, context.user.passwordHash, body.data.password);
    await verifyTotpSettingsFactor(context.user.id, body.data.currentCode, true);
    const now = new Date();
    await prisma.$transaction([
      prisma.company.update({ where: { id: context.company.id }, data: { mfaPolicy: body.data.policy } }),
      prisma.userSession.updateMany({ where: { companyId: context.company.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.mobileDeviceSession.updateMany({ where: { companyId: context.company.id, id: { not: context.sessionId }, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    return mobileSuccess({ ok: true, policy: body.data.policy });
  } catch (error) {
    return mobileSafeError(error);
  }
}
