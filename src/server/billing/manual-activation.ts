import { activateCompanySubscription } from "@/server/billing/subscription-activation";

export type ManualActivationInput = {
  companyId: string;
  planSlug: string;
  billingPeriod: "MONTHLY" | "YEARLY";
  startsAt: Date;
  endsAt: Date;
  currency: string;
  paymentMethod: "MANUAL_BANK_TRANSFER" | "MANUAL" | "FREE_PROMO" | "OTHER";
  adminUserId: string;
  note: string;
  idempotencyKey: string;
  requestId?: string;
  customAmount?: number;
};

export function activateSubscriptionManually(input: ManualActivationInput) {
  return activateCompanySubscription({
    companyId: input.companyId,
    planSlug: input.planSlug,
    billingPeriod: input.billingPeriod,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    source: "MANUAL_ADMIN",
    actorUserId: input.adminUserId,
    reason: input.note,
    correlationId: input.idempotencyKey,
    manualRequestId: input.requestId,
    payment: {
      mode: "CREATE",
      provider: "MANUAL",
      providerPaymentId: `manual:${input.idempotencyKey}`,
      paymentMethod: input.paymentMethod,
      currency: input.currency,
      customAmount: input.customAmount,
      metadata:
        input.paymentMethod === "FREE_PROMO"
          ? { grantType: "ADMIN_PROMOTIONAL" }
          : undefined,
    },
  });
}
