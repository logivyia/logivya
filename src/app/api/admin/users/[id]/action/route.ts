import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";

const schema = z.object({
  action: z.enum(["SUSPEND", "REACTIVATE", "FORCE_LOGOUT", "RESET_MFA", "REQUIRE_MFA"]),
  reason: z.string().min(5).max(500),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = schema.parse(await request.json());
    const actor = await requireCriticalAdminAction(request, "users:manage", body.reason);
    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, include: { memberships: { take: 1 } } });
    if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const now = new Date();

    if (body.action === "SUSPEND") await prisma.user.update({ where: { id }, data: { status: "SUSPENDED" } });
    if (body.action === "REACTIVATE") await prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
    if (body.action === "FORCE_LOGOUT") {
      await prisma.$transaction([
        prisma.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
        prisma.mobileDeviceSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
      ]);
    }
    if (body.action === "RESET_MFA" || body.action === "REQUIRE_MFA") {
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { mfaRequired: body.action === "REQUIRE_MFA", mfaRequiredAt: body.action === "REQUIRE_MFA" ? now : null } }),
        prisma.mfaCredential.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now, setupKey: null, setupTokenHash: null, setupExpiresAt: null, setupLockedUntil: null },
        }),
        prisma.trustedDevice.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
        prisma.mfaLoginChallenge.updateMany({ where: { userId: id, consumedAt: null }, data: { consumedAt: now } }),
        prisma.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
        prisma.mobileDeviceSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
      ]);
      await sendTemplateEmailSafely({
        to: user.email,
        template: "security_alert",
        userId: user.id,
        companyId: user.memberships[0]?.companyId,
        variables: {
          title: body.action === "REQUIRE_MFA" ? "Logivya iki adimli dogrulama kurulumu" : "Logivya iki adimli dogrulama sifirlandi",
          message: body.action === "REQUIRE_MFA"
            ? "Yoneticiniz hesabiniza iki adimli dogrulama zorunlulugu ekledi. Sonraki girisinizde Authenticator kurulumunu tamamlayin."
            : "Hesabinizdaki iki adimli dogrulama yonetici tarafindan sifirlandi. Bu islemi siz istemediyseniz destek ekibiyle iletisime gecin.",
        },
      });
    }

    const companyId = user.memberships[0]?.companyId;
    if (companyId) {
      await prisma.auditLog.create({
        data: { companyId, userId: actor.user.id, action: `admin.user.${body.action.toLowerCase()}`, entityType: "User", entityId: id, metadata: { reason: body.reason } },
      });
    }
    await prisma.securityEvent.create({
      data: { companyId, userId: id, severity: body.action === "RESET_MFA" || body.action === "REQUIRE_MFA" ? "HIGH" : "MEDIUM", type: `ADMIN_USER_${body.action}`, message: `Yonetici kullanici guvenlik islemi uyguladi: ${body.action}.`, metadata: { actorUserId: actor.user.id, reason: body.reason } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "FORBIDDEN" }, { status: 403 });
  }
}
