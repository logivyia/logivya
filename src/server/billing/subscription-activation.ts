import type { BillingPeriod, BillingProvider, PaymentMethod, Prisma, SubscriptionSource } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";

import { deriveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { corePlanRule } from "@/server/billing/plan-matrix";
import { isBillingProfileComplete } from "@/server/billing/subscription-guard";
import { prisma } from "@/server/db";

const REPLACED_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE", "MANUAL_PENDING", "PAYMENT_PENDING"] as const;

type CreatePaymentInput = {
  mode: "CREATE";
  provider: BillingProvider;
  providerPaymentId: string;
  externalPaymentId?: string;
  paymentMethod: PaymentMethod;
  currency: string;
  customAmount?: number;
};

type ConfirmPaymentInput = {
  mode: "CONFIRM_EXISTING";
  paymentId: string;
  provider: Exclude<BillingProvider, "MANUAL">;
  providerPaymentId: string;
  externalPaymentId?: string;
  observedAmount?: number;
  observedCurrency?: string;
  eventId: string;
};

export type CompanySubscriptionActivationInput = {
  companyId: string;
  planSlug: string;
  billingPeriod: BillingPeriod;
  startsAt: Date;
  endsAt: Date;
  source: Extract<SubscriptionSource, "MANUAL_ADMIN" | "PAYMENT_PROVIDER">;
  actorUserId?: string;
  reason?: string;
  correlationId?: string;
  payment?: CreatePaymentInput | ConfirmPaymentInput;
};

export class SubscriptionActivationError extends Error {
  constructor(
    code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "SubscriptionActivationError";
  }
}

export function assertPlanSeatCompatibility(input: { usedSeats: number; targetSeatLimit: number; planSlug: string }) {
  if (input.usedSeats <= input.targetSeatLimit) return;
  throw new SubscriptionActivationError("DOWNGRADE_SEAT_RECONCILIATION_REQUIRED", {
    usedSeats: input.usedSeats,
    targetSeatLimit: input.targetSeatLimit,
    planSlug: input.planSlug,
  });
}

function decimal(value: Prisma.Decimal | number | string) {
  return new PrismaRuntime.Decimal(value);
}

function expectedManualAmount(
  plan: { slug: string; monthlyPrice: Prisma.Decimal; yearlyPrice: Prisma.Decimal },
  input: CreatePaymentInput,
  billingPeriod: BillingPeriod,
) {
  if (input.paymentMethod === "FREE_PROMO") return decimal(0);
  if (plan.slug === "enterprise" && input.customAmount !== undefined) return decimal(input.customAmount);
  if (billingPeriod === "MONTHLY") {
    const authoritativeRule = corePlanRule(plan.slug);
    if (authoritativeRule) return decimal(authoritativeRule.monthlyPriceTry);
  }
  return billingPeriod === "YEARLY" ? decimal(plan.yearlyPrice) : decimal(plan.monthlyPrice);
}

function assertCurrency(actual: string, expected: string) {
  if (actual.trim().toUpperCase() !== expected.trim().toUpperCase()) {
    throw new SubscriptionActivationError("PAYMENT_CURRENCY_MISMATCH", { expected, actual });
  }
}

export async function activateCompanySubscription(input: CompanySubscriptionActivationInput) {
  if (input.endsAt <= input.startsAt) throw new SubscriptionActivationError("INVALID_SUBSCRIPTION_PERIOD");
  if (input.source === "MANUAL_ADMIN" && !input.actorUserId) throw new SubscriptionActivationError("ADMIN_ACTOR_REQUIRED");

  try {
    return await prisma.$transaction(async (tx) => {
      const lockedCompany = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Company" WHERE "id" = ${input.companyId} FOR UPDATE
      `;
      if (!lockedCompany.length) throw new SubscriptionActivationError("COMPANY_NOT_FOUND");

      const [company, plan, profile] = await Promise.all([
        tx.company.findUnique({ where: { id: input.companyId }, include: { owner: true } }),
        tx.plan.findUnique({ where: { slug: input.planSlug } }),
        tx.companyBillingProfile.findUnique({ where: { companyId: input.companyId } }),
      ]);
      if (!company || !plan || !plan.isActive) throw new SubscriptionActivationError("PLAN_NOT_FOUND");
      if (input.payment && !isBillingProfileComplete(profile)) throw new SubscriptionActivationError("billing.profileIncomplete");

      if (input.payment?.mode === "CREATE") {
        const existing = await tx.payment.findUnique({
          where: { provider_providerPaymentId: { provider: input.payment.provider, providerPaymentId: input.payment.providerPaymentId } },
          include: { subscription: true, invoice: true },
        });
        if (existing?.subscription) {
          return { subscription: existing.subscription, payment: existing, invoice: existing.invoice, previousPlan: null, idempotent: true };
        }
        if (existing) throw new SubscriptionActivationError("PAYMENT_IDEMPOTENCY_CONFLICT");
      }

      if (input.source === "MANUAL_ADMIN") {
        const identicalSubscription = await tx.subscription.findFirst({
          where: {
            companyId: company.id,
            planId: plan.id,
            source: "MANUAL_ADMIN",
            status: "ACTIVE",
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
          include: { payments: { orderBy: { createdAt: "desc" }, take: 1, include: { invoice: true } } },
        });
        if (identicalSubscription) {
          const existingPayment = identicalSubscription.payments[0] ?? null;
          return {
            subscription: identicalSubscription,
            payment: existingPayment,
            invoice: existingPayment?.invoice ?? null,
            previousPlan: null,
            idempotent: true,
          };
        }
      }

      let pendingPayment = null;
      if (input.payment?.mode === "CONFIRM_EXISTING") {
        pendingPayment = await tx.payment.findUnique({ where: { id: input.payment.paymentId }, include: { subscription: true, invoice: true } });
        if (!pendingPayment) throw new SubscriptionActivationError("PAYMENT_NOT_FOUND");
        if (
          pendingPayment.companyId !== company.id
          || pendingPayment.planId !== plan.id
          || pendingPayment.provider !== input.payment.provider
          || pendingPayment.providerPaymentId !== input.payment.providerPaymentId
        ) {
          throw new SubscriptionActivationError("PAYMENT_SCOPE_MISMATCH");
        }
        if (["SUCCEEDED", "PAID"].includes(pendingPayment.status) && pendingPayment.subscription) {
          return { subscription: pendingPayment.subscription, payment: pendingPayment, invoice: pendingPayment.invoice, previousPlan: null, idempotent: true };
        }
        if (input.payment.observedAmount !== undefined && !decimal(pendingPayment.amount).eq(decimal(input.payment.observedAmount))) {
          throw new SubscriptionActivationError("PAYMENT_AMOUNT_MISMATCH", {
            expected: pendingPayment.amount.toString(),
            actual: input.payment.observedAmount,
          });
        }
        if (input.payment.observedCurrency) assertCurrency(input.payment.observedCurrency, pendingPayment.currency);
      }

      const now = new Date();
      await tx.companyInvitation.updateMany({
        where: { companyId: company.id, status: "PENDING", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      const [activeMembers, legacyInvitedMembers, pendingInvitations] = await Promise.all([
        tx.companyUser.count({ where: { companyId: company.id, status: "ACTIVE" } }),
        tx.companyUser.count({ where: { companyId: company.id, status: "INVITED" } }),
        tx.companyInvitation.count({ where: { companyId: company.id, status: "PENDING", expiresAt: { gt: now } } }),
      ]);
      const usedSeats = activeMembers + legacyInvitedMembers + pendingInvitations;
      const targetSeatLimit = deriveCompanyEntitlements(plan, true).teamSeats;
      assertPlanSeatCompatibility({ usedSeats, targetSeatLimit, planSlug: plan.slug });

      const previous = await tx.subscription.findFirst({
        where: { companyId: company.id, status: { in: [...REPLACED_SUBSCRIPTION_STATUSES] } },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      });
      await tx.subscription.updateMany({
        where: { companyId: company.id, status: { in: [...REPLACED_SUBSCRIPTION_STATUSES] } },
        data: { status: "CANCELED", cancelledAt: now, cancelAtPeriodEnd: false },
      });

      const subscription = await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: plan.id,
          status: "ACTIVE",
          billingPeriod: input.billingPeriod,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          currentPeriodStartsAt: input.startsAt,
          currentPeriodEndsAt: input.endsAt,
          source: input.source,
          provider: input.payment?.provider ?? "MANUAL",
          manuallyActivatedByUserId: input.source === "MANUAL_ADMIN" ? input.actorUserId : undefined,
          providerSubscriptionId: input.payment?.providerPaymentId,
        },
      });

      let payment = null;
      if (input.payment?.mode === "CREATE") {
        assertCurrency(input.payment.currency, plan.currency);
        const amount = expectedManualAmount(plan, input.payment, input.billingPeriod);
        payment = await tx.payment.create({
          data: {
            companyId: company.id,
            subscriptionId: subscription.id,
            planId: plan.id,
            provider: input.payment.provider,
            providerPaymentId: input.payment.providerPaymentId,
            externalPaymentId: input.payment.externalPaymentId,
            status: input.payment.provider === "MANUAL" ? "MANUALLY_CONFIRMED" : "SUCCEEDED",
            paymentMethod: input.payment.paymentMethod,
            amount,
            currency: input.payment.currency.toUpperCase(),
            paidAt: now,
            metadata: { reason: input.reason ?? "", correlationId: input.correlationId ?? null },
          },
        });
      } else if (input.payment?.mode === "CONFIRM_EXISTING" && pendingPayment) {
        payment = await tx.payment.update({
          where: { id: pendingPayment.id },
          data: {
            subscriptionId: subscription.id,
            status: "SUCCEEDED",
            paidAt: now,
            failedAt: null,
            failureReason: null,
            externalPaymentId: input.payment.externalPaymentId ?? pendingPayment.externalPaymentId,
            metadata: { eventId: input.payment.eventId, correlationId: input.correlationId ?? null, verifiedAt: now.toISOString() },
          },
        });
      }

      let invoice = null;
      if (payment && profile) {
        invoice = pendingPayment?.invoice ?? await tx.invoice.create({
          data: {
            companyId: company.id,
            subscriptionId: subscription.id,
            invoiceType: profile.invoiceType,
            status: "DRAFT",
            currency: payment.currency,
            subtotalAmount: payment.amount,
            taxAmount: 0,
            totalAmount: payment.amount,
            billingName: profile.billingType === "COMPANY" ? profile.legalName! : profile.fullName!,
            billingTaxOffice: profile.taxOffice,
            billingTaxNumber: profile.taxNumber || profile.nationalIdNumber,
            billingAddress: [profile.addressLine1, profile.addressLine2, profile.district, profile.city, profile.country].filter(Boolean).join(", "),
            billingEmail: profile.billingEmail,
            provider: input.payment?.provider ?? "MANUAL",
            metadata: { paymentId: payment.id, correlationId: input.correlationId ?? null },
          },
        });
        if (payment.invoiceId !== invoice.id) payment = await tx.payment.update({ where: { id: payment.id }, data: { invoiceId: invoice.id } });
      }

      const activationEventType = input.source === "MANUAL_ADMIN" ? "SUBSCRIPTION_MANUALLY_ACTIVATED" : "SUBSCRIPTION_ACTIVATED";
      await tx.subscriptionEvent.create({
        data: {
          companyId: company.id,
          subscriptionId: subscription.id,
          actorUserId: input.actorUserId,
          type: activationEventType,
          message: `${plan.name} paketi etkinleştirildi.`,
          metadata: {
            source: input.source,
            reason: input.reason ?? "",
            previousPlan: previous?.plan.slug ?? null,
            newPlan: plan.slug,
            correlationId: input.correlationId ?? null,
            usedSeats,
            targetSeatLimit,
          },
        },
      });
      if (payment) {
        await tx.subscriptionEvent.create({
          data: { companyId: company.id, subscriptionId: subscription.id, actorUserId: input.actorUserId, type: "PAYMENT_RECEIVED", message: "Doğrulanmış ödeme kaydedildi.", metadata: { paymentId: payment.id, provider: payment.provider } },
        });
      }
      if (invoice) {
        await tx.subscriptionEvent.create({
          data: { companyId: company.id, subscriptionId: subscription.id, actorUserId: input.actorUserId, type: "INVOICE_CREATED", message: "Taslak fatura oluşturuldu.", metadata: { invoiceId: invoice.id } },
        });
      }
      await tx.notification.create({
        data: {
          companyId: company.id,
          userId: company.ownerId,
          type: "SUBSCRIPTION_ACTIVATED",
          title: "Aboneliğiniz etkinleştirildi",
          message: `${plan.name} paketiniz ${input.endsAt.toLocaleDateString("tr-TR")} tarihine kadar aktif.`,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: input.actorUserId,
          action: input.source === "MANUAL_ADMIN" ? "PLAN_ASSIGNED_BY_ADMIN" : "PLAN_PURCHASED",
          entityType: "Subscription",
          entityId: subscription.id,
          metadata: {
            source: input.source,
            reason: input.reason ?? "",
            previousPlan: previous?.plan.slug ?? null,
            newPlan: plan.slug,
            paymentId: payment?.id ?? null,
            correlationId: input.correlationId ?? null,
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
          },
        },
      });

      return { subscription, payment, invoice, previousPlan: previous?.plan.slug ?? null, idempotent: false };
    }, { isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof SubscriptionActivationError && error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED") {
      await prisma.auditLog.create({
        data: {
          companyId: input.companyId,
          userId: input.actorUserId,
          action: "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED",
          entityType: "Plan",
          metadata: { ...error.details, reason: input.reason ?? "", correlationId: input.correlationId ?? null },
        },
      }).catch(() => undefined);
    }
    throw error;
  }
}
