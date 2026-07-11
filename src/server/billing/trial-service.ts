import type { Prisma } from "@prisma/client";
import { trialEndsAt } from "@/server/billing/trial-policy";

type CreateTrialInput = {
  companyId: string;
  planId: string;
  userId: string;
  startedAt?: Date;
};

export async function ensureSevenDayTrial(tx: Prisma.TransactionClient, input: CreateTrialInput) {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Company"
    WHERE id = ${input.companyId}
    FOR UPDATE
  `;

  const existing = await tx.subscription.findFirst({
    where: { companyId: input.companyId, source: "TRIAL" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { subscription: existing, created: false };

  const startedAt = input.startedAt ?? new Date();
  const endsAt = trialEndsAt(startedAt);
  const subscription = await tx.subscription.create({
    data: {
      companyId: input.companyId,
      planId: input.planId,
      status: "TRIALING",
      billingPeriod: "TRIAL",
      startsAt: startedAt,
      endsAt,
      trialStartsAt: startedAt,
      trialEndsAt: endsAt,
      currentPeriodStartsAt: startedAt,
      currentPeriodEndsAt: endsAt,
      source: "TRIAL",
      provider: "MANUAL",
    },
  });

  await tx.subscriptionEvent.create({
    data: {
      companyId: input.companyId,
      subscriptionId: subscription.id,
      actorUserId: input.userId,
      type: "TRIAL_STARTED",
      message: "7 günlük ücretsiz deneme başlatıldı.",
    },
  });
  await tx.notification.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      type: "TRIAL_STARTED",
      title: "Deneme paketi başladı",
      message: "7 günlük ücretsiz denemeniz başladı.",
    },
  });

  return { subscription, created: true };
}
