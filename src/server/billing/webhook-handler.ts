import { createHash } from "node:crypto";

import { activateCompanySubscription, SubscriptionActivationError } from "@/server/billing/subscription-activation";
import {
  PaymentWebhookVerificationError,
  verifyPaymentWebhook,
  type PaymentWebhookProvider,
} from "@/server/billing/payment-webhook-verification";
import { retrieveAndVerifyIyzicoPayment } from "@/server/billing/iyzico-payment-verification";
import { prisma } from "@/server/db";

function metadataDate(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function metadataBillingPeriod(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).billingPeriod;
  return value === "MONTHLY" || value === "YEARLY" ? value : null;
}

export async function receivePaymentWebhook(provider: PaymentWebhookProvider, request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) return { status: 413, body: { error: "WEBHOOK_PAYLOAD_TOO_LARGE" } };
  const payload = await request.text();
  if (Buffer.byteLength(payload, "utf8") > 1_000_000) return { status: 413, body: { error: "WEBHOOK_PAYLOAD_TOO_LARGE" } };
  let receiptId: string | null = null;
  try {
    const event = verifyPaymentWebhook(provider, request, payload);
    const receipt = await prisma.billingWebhookReceipt.upsert({
      where: { provider_eventId: { provider, eventId: event.eventId } },
      create: {
        provider,
        eventId: event.eventId,
        eventType: event.eventType,
        providerPaymentId: event.providerPaymentId,
        payloadHash: createHash("sha256").update(payload).digest("hex"),
      },
      update: { attempts: { increment: 1 } },
    });
    receiptId = receipt.id;
    if (receipt.status === "PROCESSED") return { status: 200, body: { ok: true, idempotent: true, eventId: event.eventId } };
    if (event.status === "IGNORED") {
      await prisma.billingWebhookReceipt.update({ where: { id: receipt.id }, data: { status: "PROCESSED", processedAt: new Date() } });
      return { status: 200, body: { ok: true, ignored: true, eventId: event.eventId } };
    }

    const payment = await prisma.payment.findUnique({
      where: { provider_providerPaymentId: { provider, providerPaymentId: event.providerPaymentId } },
      include: { plan: true, subscription: true, company: { select: { ownerId: true } } },
    });
    if (!payment || !payment.plan) return { status: 404, body: { error: "PAYMENT_NOT_FOUND" } };

    if (event.status === "REFUNDED" || event.status === "CHARGEBACK") {
      const now = new Date();
      const eventType = event.status === "CHARGEBACK" ? "PAYMENT_CHARGEBACK" : "PAYMENT_REFUNDED";
      await prisma.$transaction(async (tx) => {
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status !== "REFUNDED") {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "REFUNDED",
              failureReason: eventType,
              metadata: { eventId: event.eventId, eventType: event.eventType, reversalType: event.status, reversedAt: now.toISOString() },
            },
          });
          if (payment.subscriptionId) {
            await tx.subscription.updateMany({
              where: { id: payment.subscriptionId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
              data: { status: "SUSPENDED" },
            });
          }
          await tx.auditLog.create({
            data: {
              companyId: payment.companyId,
              action: eventType,
              entityType: "Payment",
              entityId: payment.id,
              metadata: { provider, eventId: event.eventId, providerEventType: event.eventType },
            },
          });
          await tx.subscriptionAuditLog.create({
            data: {
              companyId: payment.companyId,
              subscriptionId: payment.subscriptionId,
              eventType,
              previousState: { paymentStatus: current.status, subscriptionStatus: payment.subscription?.status ?? null },
              newState: { paymentStatus: "REFUNDED", subscriptionStatus: payment.subscriptionId ? "SUSPENDED" : null },
              correlationId: event.eventId,
            },
          });
          await tx.securityEvent.create({
            data: {
              companyId: payment.companyId,
              severity: event.status === "CHARGEBACK" ? "CRITICAL" : "HIGH",
              type: eventType,
              message: event.status === "CHARGEBACK" ? "Payment chargeback requires administrator review." : "Payment refund recorded by verified provider webhook.",
              metadata: { paymentId: payment.id, provider, eventId: event.eventId },
            },
          });
          await tx.notification.create({
            data: {
              companyId: payment.companyId,
              userId: payment.company.ownerId,
              type: eventType,
              title: event.status === "CHARGEBACK" ? "Ödeme itirazı alındı" : "Ödeme iadesi işlendi",
              message: event.status === "CHARGEBACK"
                ? "Ödeme sağlayıcısı bir chargeback bildirdi. Abonelik güvenlik incelemesine alındı."
                : "Ödeme iadesi sağlayıcı tarafından doğrulandı ve abonelik askıya alındı.",
            },
          });
        }
      });
      await prisma.billingWebhookReceipt.update({ where: { id: receipt.id }, data: { status: "PROCESSED", processedAt: now, lastError: null } });
      return { status: 200, body: { ok: true, reversed: true, reversalType: event.status, eventId: event.eventId } };
    }

    if (event.status === "FAILED") {
      if (!["SUCCEEDED", "PAID", "MANUALLY_CONFIRMED"].includes(payment.status)) {
        await prisma.$transaction([
          prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              failedAt: new Date(),
              failureReason: event.failureReason ?? "PAYMENT_FAILED",
              metadata: { eventId: event.eventId, eventType: event.eventType },
            },
          }),
          prisma.auditLog.create({
            data: {
              companyId: payment.companyId,
              action: "PAYMENT_FAILED",
              entityType: "Payment",
              entityId: payment.id,
              metadata: { provider, eventId: event.eventId, eventType: event.eventType },
            },
          }),
          prisma.subscriptionAuditLog.create({
            data: {
              companyId: payment.companyId,
              subscriptionId: payment.subscriptionId,
              eventType: "PAYMENT_FAILED",
              previousState: { status: payment.status },
              newState: { status: "FAILED", provider, eventId: event.eventId },
              correlationId: event.eventId,
            },
          }),
          prisma.notification.create({
            data: {
              companyId: payment.companyId,
              userId: payment.company.ownerId,
              type: "PAYMENT_FAILED",
              title: "Ödeme tamamlanamadı",
              message: "Ödeme sağlayıcısı işlemi başarısız olarak bildirdi. Aboneliğiniz etkinleştirilmedi.",
            },
          }),
        ]);
      }
      await prisma.billingWebhookReceipt.update({ where: { id: receipt.id }, data: { status: "PROCESSED", processedAt: new Date(), lastError: null } });
      return { status: 200, body: { ok: true, failed: true, eventId: event.eventId } };
    }

    const now = new Date();
    const billingPeriod = payment.subscription?.billingPeriod === "YEARLY"
      ? "YEARLY"
      : metadataBillingPeriod(payment.metadata) ?? "MONTHLY";
    const startsAt = metadataDate(payment.metadata, "startsAt") ?? now;
    const storedEnd = payment.subscription?.currentPeriodEndsAt ?? payment.subscription?.endsAt ?? metadataDate(payment.metadata, "endsAt");
    const endsAt = storedEnd && storedEnd > startsAt
      ? storedEnd
      : new Date(startsAt.getTime() + (billingPeriod === "YEARLY" ? 365 : 30) * 86_400_000);
    const providerVerification = provider === "IYZICO"
      ? await retrieveAndVerifyIyzicoPayment({
          paymentId: event.externalPaymentId!,
          paymentConversationId: event.providerPaymentId,
        })
      : { observedAmount: event.observedAmount, observedCurrency: event.observedCurrency };
    const result = await activateCompanySubscription({
      companyId: payment.companyId,
      planSlug: payment.plan.slug,
      billingPeriod,
      startsAt,
      endsAt,
      source: "PAYMENT_PROVIDER",
      reason: `${provider} verified webhook`,
      correlationId: event.eventId,
      payment: {
        mode: "CONFIRM_EXISTING",
        paymentId: payment.id,
        provider,
        providerPaymentId: event.providerPaymentId,
        externalPaymentId: event.externalPaymentId,
        observedAmount: providerVerification.observedAmount,
        observedCurrency: providerVerification.observedCurrency,
        eventId: event.eventId,
      },
    });
    await prisma.billingWebhookReceipt.update({ where: { id: receipt.id }, data: { status: "PROCESSED", processedAt: new Date(), lastError: null } });
    return { status: 200, body: { ok: true, idempotent: result.idempotent, eventId: event.eventId } };
  } catch (error) {
    if (receiptId) {
      await prisma.billingWebhookReceipt.update({
        where: { id: receiptId },
        data: { status: "FAILED", lastError: (error instanceof Error ? error.message : "PAYMENT_WEBHOOK_PROCESSING_FAILED").slice(0, 300) },
      }).catch(() => undefined);
    }
    if (error instanceof PaymentWebhookVerificationError) {
      const status = error.message === "PAYMENT_WEBHOOK_NOT_CONFIGURED" ? 503
        : error.message === "INVALID_WEBHOOK_PAYLOAD" ? 400
          : ["IYZICO_PAYMENT_RETRIEVE_FAILED", "IYZICO_PAYMENT_DETAILS_UNVERIFIED"].includes(error.message) ? 502
            : error.message === "IYZICO_PAYMENT_NOT_APPROVED" ? 409
              : 401;
      return { status, body: { error: error.message } };
    }
    if (error instanceof SubscriptionActivationError) {
      const status = error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED" ? 409 : 400;
      return { status, body: { error: error.message, details: error.details } };
    }
    return { status: 500, body: { error: "PAYMENT_WEBHOOK_PROCESSING_FAILED" } };
  }
}
