import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  action: z.enum([
    "SUSPEND",
    "REACTIVATE",
    "FORCE_LOGOUT",
    "RESET_MFA",
    "REQUIRE_MFA",
  ]),
  reason: z.string().min(5).max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation.invalid", requestId: operationId },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const actor = await requireCriticalAdminAction(
      request,
      "admin.users.update",
      body.reason,
    );
    const { id } = await params;
    if (id === actor.user.id) {
      return NextResponse.json(
        { error: "ADMIN_SELF_ACTION_FORBIDDEN", requestId: operationId },
        { status: 409 },
      );
    }
    const user = await prisma.user.findUnique({
      where: { id },
      include: { memberships: { take: 1 } },
    });
    if (!user)
      return NextResponse.json(
        { error: "NOT_FOUND", requestId: operationId },
        { status: 404 },
      );
    const now = new Date();

    if (body.action === "SUSPEND" || body.action === "REACTIVATE") {
      const desiredStatus = body.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
      if (user.status === desiredStatus) {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          requestId: operationId,
        });
      }
      const transition = await prisma.user.updateMany({
        where: { id, status: user.status },
        data: { status: desiredStatus },
      });
      if (transition.count !== 1) {
        const current = await prisma.user.findUnique({
          where: { id },
          select: { status: true },
        });
        if (current?.status === desiredStatus) {
          return NextResponse.json({
            ok: true,
            idempotent: true,
            requestId: operationId,
          });
        }
        return NextResponse.json(
          { error: "USER_STATE_CHANGED", requestId: operationId },
          { status: 409 },
        );
      }
    }
    if (body.action === "FORCE_LOGOUT") {
      const [webSessions, mobileSessions] = await prisma.$transaction([
        prisma.userSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        }),
        prisma.mobileDeviceSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);
      if (webSessions.count + mobileSessions.count === 0) {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          requestId: operationId,
        });
      }
    }
    if (body.action === "REQUIRE_MFA" && user.mfaRequired) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        requestId: operationId,
      });
    }
    if (body.action === "RESET_MFA" || body.action === "REQUIRE_MFA") {
      await prisma.$transaction([
        prisma.user.update({
          where: { id },
          data: {
            mfaRequired: body.action === "REQUIRE_MFA",
            mfaRequiredAt: body.action === "REQUIRE_MFA" ? now : null,
          },
        }),
        prisma.mfaCredential.updateMany({
          where: { userId: id, revokedAt: null },
          data: {
            revokedAt: now,
            setupKey: null,
            setupTokenHash: null,
            setupExpiresAt: null,
            setupLockedUntil: null,
          },
        }),
        prisma.trustedDevice.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        }),
        prisma.mfaLoginChallenge.updateMany({
          where: { userId: id, consumedAt: null },
          data: { consumedAt: now },
        }),
        prisma.userSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        }),
        prisma.mobileDeviceSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);
      await sendTemplateEmailSafely({
        to: user.email,
        template: "security_alert",
        userId: user.id,
        companyId: user.memberships[0]?.companyId,
        variables: {
          title:
            body.action === "REQUIRE_MFA"
              ? "Logivya iki adimli dogrulama kurulumu"
              : "Logivya iki adimli dogrulama sifirlandi",
          message:
            body.action === "REQUIRE_MFA"
              ? "Yoneticiniz hesabiniza iki adimli dogrulama zorunlulugu ekledi. Sonraki girisinizde Authenticator kurulumunu tamamlayin."
              : "Hesabinizdaki iki adimli dogrulama yonetici tarafindan sifirlandi. Bu islemi siz istemediyseniz destek ekibiyle iletisime gecin.",
        },
      });
    }

    const companyId = user.memberships[0]?.companyId;
    if (companyId) {
      await prisma.auditLog.create({
        data: {
          companyId,
          userId: actor.user.id,
          action: `admin.user.${body.action.toLowerCase()}`,
          entityType: "User",
          entityId: id,
          metadata: { reason: body.reason },
        },
      });
    }
    await prisma.securityEvent.create({
      data: {
        companyId,
        userId: id,
        severity:
          body.action === "RESET_MFA" || body.action === "REQUIRE_MFA"
            ? "HIGH"
            : "MEDIUM",
        type: `ADMIN_USER_${body.action}`,
        message: `Yonetici kullanici guvenlik islemi uyguladi: ${body.action}.`,
        metadata: { actorUserId: actor.user.id, reason: body.reason },
      },
    });
    return NextResponse.json({ ok: true, requestId: operationId });
  } catch (error) {
    const safe = safeAdminError(error, operationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
