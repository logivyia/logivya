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
  try {
    const event = verifyPaymentWebhook(provider, request, payload);
    if (event.status === "IGNORED") return { status: 200, body: { ok: true, ignored: true, eventId: event.eventId } };

    const payment = await prisma.payment.findUnique({
      where: { provider_providerPaymentId: { provider, providerPaymentId: event.providerPaymentId } },
      include: { plan: true, subscription: true },
    });
    if (!payment || !payment.plan) return { status: 404, body: { error: "PAYMENT_NOT_FOUND" } };

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
        ]);
      }
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
    return { status: 200, body: { ok: true, idempotent: result.idempotent, eventId: event.eventId } };
  } catch (error) {
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
