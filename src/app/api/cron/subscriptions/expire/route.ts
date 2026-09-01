import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const now = new Date();
  const expired = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      OR: [{ endsAt: { lt: now } }, { endsAt: null, currentPeriodEndsAt: { lt: now } }],
    },
    include: { company: true },
  });
  for (const item of expired) {
    await prisma.$transaction(async (tx) => {
      const sharedMembers = await tx.companyUser.findMany({
        where: {
          companyId: item.companyId,
          role: { not: "OWNER" },
          status: "ACTIVE",
          lifecycleState: "ACTIVE_SHARED_MEMBER",
        },
        select: { id: true, userId: true },
      });
      await tx.subscription.update({ where: { id: item.id }, data: { status: "EXPIRED", expiredAt: now } });
      if (sharedMembers.length) {
        await tx.companyUser.updateMany({
          where: { id: { in: sharedMembers.map((member) => member.id) } },
          data: {
            lifecycleState: "SHARED_SUBSCRIPTION_EXPIRED",
            sharedAccessExpiredAt: now,
          },
        });
        await tx.auditLog.createMany({
          data: sharedMembers.map((member) => ({
            companyId: item.companyId,
            userId: member.userId,
            actorType: "SYSTEM",
            action: "SHARED_SUBSCRIPTION_EXPIRED",
            entityType: "CompanyUser",
            entityId: member.id,
            beforeState: { lifecycleState: "ACTIVE_SHARED_MEMBER" },
            afterState: {
              lifecycleState: "SHARED_SUBSCRIPTION_EXPIRED",
              expiredAt: now.toISOString(),
            },
          })),
        });
        await tx.notification.createMany({
          data: sharedMembers.map((member) => ({
            companyId: item.companyId,
            userId: member.userId,
            type: "SHARED_SUBSCRIPTION_EXPIRED",
            category: "BILLING" as const,
            title: "Shared subscription ended",
            message: "You can select a personal plan from Subscription.",
            deepLink: "/settings/subscriptions",
          })),
        });
      }
      await tx.subscriptionEvent.create({
        data: {
          companyId: item.companyId,
          subscriptionId: item.id,
          type: item.status === "TRIALING" ? "TRIAL_EXPIRED" : "SUBSCRIPTION_EXPIRED",
          message: item.status === "TRIALING" ? "Deneme süresi sona erdi." : "Abonelik süresi sona erdi.",
        },
      });
      if (item.status === "TRIALING") {
        await tx.trialEntitlement.updateMany({
          where: { companyId: item.companyId, status: "ACTIVE" },
          data: { status: "CONSUMED", decisionCode: "TRIAL_PERIOD_ENDED" },
        });
      }
      await tx.subscriptionAuditLog.create({
        data: {
          companyId: item.companyId,
          subscriptionId: item.id,
          eventType: item.status === "TRIALING" ? "TRIAL_EXPIRED" : "SUBSCRIPTION_EXPIRED",
          previousState: { status: item.status },
          newState: { status: "EXPIRED", expiredAt: now.toISOString() },
        },
      });
      await tx.notification.create({
        data: {
          companyId: item.companyId,
          userId: item.company.ownerId,
          type: "SUBSCRIPTION_EXPIRED",
          title: "Aboneliğiniz sona erdi",
          message: "Mesaj göndermek için paketinizi yenileyin.",
        },
      });
    });
  }
  return NextResponse.json({ ok: true, expired: expired.length });
}
