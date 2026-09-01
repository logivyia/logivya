import { createHash, randomUUID } from "node:crypto";
import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

import {
  appleSubscriptionProduct,
  appleSubscriptionProductIds,
} from "@/server/billing/apple-store-products";
import {
  verifyAppleNotification,
  verifyAppleRenewalInfo,
  verifyAppleSignedTransaction,
} from "@/server/billing/apple-store-verifier";
import {
  activateCompanySubscription,
  SubscriptionActivationError,
} from "@/server/billing/subscription-activation";
import { corePlanRule } from "@/server/billing/plan-matrix";
import { prisma } from "@/server/db";

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE"] as const;
const TERMINAL_NOTIFICATION_TYPES = new Set([
  "EXPIRED",
  "GRACE_PERIOD_EXPIRED",
  "REFUND",
  "REVOKE",
]);

export class AppleSubscriptionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
    this.name = "AppleSubscriptionError";
  }
}

function requiredText(value: string | undefined, code: string) {
  if (!value?.trim()) throw new AppleSubscriptionError(code);
  return value.trim();
}

function requiredDate(value: number | undefined, code: string) {
  if (!Number.isFinite(value)) throw new AppleSubscriptionError(code);
  const date = new Date(value!);
  if (Number.isNaN(date.getTime())) throw new AppleSubscriptionError(code);
  return date;
}

function transactionMetadata(transaction: JWSTransactionDecodedPayload) {
  return {
    productId: transaction.productId ?? "",
    originalTransactionId: transaction.originalTransactionId ?? "",
    appAccountToken: transaction.appAccountToken ?? "",
    environment: String(transaction.environment ?? ""),
    storefront: transaction.storefront ?? "",
    transactionReason: String(transaction.transactionReason ?? ""),
    offerType: transaction.offerType === undefined ? "" : String(transaction.offerType),
    offerIdentifier: transaction.offerIdentifier ?? "",
    signedDate: transaction.signedDate ?? 0,
  };
}

async function companyForAppleTransaction(transaction: JWSTransactionDecodedPayload) {
  if (transaction.appAccountToken) {
    const company = await prisma.company.findUnique({
      where: { appleAppAccountToken: transaction.appAccountToken },
      select: { id: true, ownerId: true, appleAppAccountToken: true },
    });
    if (company) return company;
  }

  if (transaction.originalTransactionId) {
    const subscription = await prisma.subscription.findFirst({
      where: {
        provider: "APPLE_APP_STORE",
        providerSubscriptionId: transaction.originalTransactionId,
      },
      orderBy: { createdAt: "desc" },
      select: { company: { select: { id: true, ownerId: true, appleAppAccountToken: true } } },
    });
    if (subscription) return subscription.company;
  }
  return null;
}

export async function getApplePurchaseContext(input: {
  companyId: string;
  userId: string;
}) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, ownerId: true, appleAppAccountToken: true },
  });
  if (!company) throw new AppleSubscriptionError("COMPANY_NOT_FOUND", 404);
  if (company.ownerId !== input.userId) {
    return {
      canPurchase: false,
      appAccountToken: null,
      productIds: [] as string[],
      reason: "OWNER_REQUIRED",
    };
  }

  let appAccountToken = company.appleAppAccountToken;
  if (!appAccountToken) {
    const candidate = randomUUID();
    await prisma.company.updateMany({
      where: { id: company.id, appleAppAccountToken: null },
      data: { appleAppAccountToken: candidate },
    });
    appAccountToken = (
      await prisma.company.findUniqueOrThrow({
        where: { id: company.id },
        select: { appleAppAccountToken: true },
      })
    ).appleAppAccountToken;
  }
  if (!appAccountToken) throw new AppleSubscriptionError("APPLE_ACCOUNT_TOKEN_UNAVAILABLE", 503);

  const now = new Date();
  await prisma.companyInvitation.updateMany({
    where: { companyId: company.id, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", reservedSeat: false },
  });
  const [activeMembers, invitedMembers, pendingInvitations] = await Promise.all([
    prisma.companyUser.count({ where: { companyId: company.id, status: "ACTIVE" } }),
    prisma.companyUser.count({ where: { companyId: company.id, status: "INVITED" } }),
    prisma.companyInvitation.count({
      where: { companyId: company.id, status: "PENDING", reservedSeat: true, expiresAt: { gt: now } },
    }),
  ]);
  const usedSeats = activeMembers + invitedMembers + pendingInvitations;
  const productIds = appleSubscriptionProductIds().filter((productId) => {
    const product = appleSubscriptionProduct(productId);
    const rule = product ? corePlanRule(product.planSlug) : null;
    return Boolean(rule && rule.totalUserSeats >= usedSeats);
  });

  return { canPurchase: true, appAccountToken, productIds, reason: null };
}

export async function activateVerifiedAppleTransaction(input: {
  transaction: JWSTransactionDecodedPayload;
  expectedCompanyId?: string;
  expectedUserId?: string;
  correlationId?: string;
}) {
  const transaction = input.transaction;
  const productId = requiredText(transaction.productId, "APPLE_PRODUCT_MISSING");
  const product = appleSubscriptionProduct(productId);
  if (!product) throw new AppleSubscriptionError("APPLE_PRODUCT_NOT_ALLOWED");
  const transactionId = requiredText(transaction.transactionId, "APPLE_TRANSACTION_ID_MISSING");
  const originalTransactionId = requiredText(
    transaction.originalTransactionId,
    "APPLE_ORIGINAL_TRANSACTION_ID_MISSING",
  );
  const startsAt = requiredDate(transaction.purchaseDate, "APPLE_PURCHASE_DATE_MISSING");
  const endsAt = requiredDate(transaction.expiresDate, "APPLE_EXPIRY_DATE_MISSING");
  if (transaction.revocationDate) throw new AppleSubscriptionError("APPLE_TRANSACTION_REVOKED", 409);
  if (endsAt <= new Date()) throw new AppleSubscriptionError("APPLE_SUBSCRIPTION_EXPIRED", 409);

  const company = await companyForAppleTransaction(transaction);
  if (!company) throw new AppleSubscriptionError("APPLE_ACCOUNT_NOT_MAPPED", 403);
  if (input.expectedCompanyId && company.id !== input.expectedCompanyId) {
    throw new AppleSubscriptionError("APPLE_ACCOUNT_SCOPE_MISMATCH", 403);
  }
  if (input.expectedUserId && company.ownerId !== input.expectedUserId) {
    throw new AppleSubscriptionError("APPLE_PURCHASE_OWNER_REQUIRED", 403);
  }
  if (
    company.appleAppAccountToken
    && transaction.appAccountToken !== company.appleAppAccountToken
  ) {
    throw new AppleSubscriptionError("APPLE_ACCOUNT_TOKEN_MISMATCH", 403);
  }

  const price = Number.isFinite(transaction.price) ? transaction.price! / 1000 : 0;
  const currency = transaction.currency?.trim().toUpperCase() || "TRY";
  const result = await activateCompanySubscription({
    companyId: company.id,
    planSlug: product.planSlug,
    billingPeriod: product.billingPeriod,
    startsAt,
    endsAt,
    source: "PAYMENT_PROVIDER",
    actorUserId: input.expectedUserId ?? company.ownerId,
    reason: "Apple App Store verified subscription",
    correlationId: input.correlationId,
    providerSubscriptionId: originalTransactionId,
    payment: {
      mode: "CREATE",
      provider: "APPLE_APP_STORE",
      providerPaymentId: transactionId,
      externalPaymentId: originalTransactionId,
      paymentMethod: "APPLE_IN_APP_PURCHASE",
      currency,
      customAmount: price,
      metadata: transactionMetadata(transaction),
    },
  });

  return {
    active: true,
    idempotent: result.idempotent,
    productId,
    transactionId,
    originalTransactionId,
    subscriptionId: result.subscription.id,
    status: result.subscription.status,
    endsAt: result.subscription.endsAt?.toISOString() ?? endsAt.toISOString(),
  };
}

export async function verifyAndActivateApplePurchase(input: {
  signedTransactionInfo: string;
  companyId: string;
  userId: string;
  correlationId?: string;
}) {
  const transaction = await verifyAppleSignedTransaction(input.signedTransactionInfo);
  return activateVerifiedAppleTransaction({
    transaction,
    expectedCompanyId: input.companyId,
    expectedUserId: input.userId,
    correlationId: input.correlationId,
  });
}

async function closeAppleSubscription(
  transaction: JWSTransactionDecodedPayload,
  notificationType: string,
  correlationId?: string,
) {
  const originalTransactionId = requiredText(
    transaction.originalTransactionId,
    "APPLE_ORIGINAL_TRANSACTION_ID_MISSING",
  );
  const company = await companyForAppleTransaction(transaction);
  if (!company) throw new AppleSubscriptionError("APPLE_ACCOUNT_NOT_MAPPED", 404);
  const status = notificationType === "REFUND" || notificationType === "REVOKE" ? "CANCELED" : "EXPIRED";
  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: {
      companyId: company.id,
      provider: "APPLE_APP_STORE",
      providerSubscriptionId: originalTransactionId,
      status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
    },
    select: { id: true },
  });
  if (!subscriptions.length) return { active: false, status, idempotent: true };

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { id: { in: subscriptions.map(({ id }) => id) } },
      data: {
        status,
        endsAt: transaction.expiresDate ? new Date(transaction.expiresDate) : now,
        currentPeriodEndsAt: transaction.expiresDate ? new Date(transaction.expiresDate) : now,
        expiredAt: status === "EXPIRED" ? now : undefined,
        cancelledAt: status === "CANCELED" ? now : undefined,
        cancelAtPeriodEnd: false,
      },
    });
    if (transaction.transactionId) {
      await tx.payment.updateMany({
        where: { provider: "APPLE_APP_STORE", providerPaymentId: transaction.transactionId },
        data: { status: notificationType === "REFUND" ? "REFUNDED" : "CANCELED" },
      });
    }
    for (const subscription of subscriptions) {
      await tx.subscriptionEvent.create({
        data: {
          companyId: company.id,
          subscriptionId: subscription.id,
          type: status === "EXPIRED" ? "SUBSCRIPTION_EXPIRED" : "SUBSCRIPTION_CANCELED",
          message: status === "EXPIRED" ? "Apple aboneliğinin süresi doldu." : "Apple aboneliği sona erdi.",
          metadata: { notificationType, originalTransactionId, correlationId: correlationId ?? null },
        },
      });
    }
  });
  return { active: false, status, idempotent: false };
}

async function markAppleBillingRetry(
  transaction: JWSTransactionDecodedPayload,
  renewal: JWSRenewalInfoDecodedPayload | null,
  correlationId?: string,
) {
  const originalTransactionId = requiredText(
    transaction.originalTransactionId,
    "APPLE_ORIGINAL_TRANSACTION_ID_MISSING",
  );
  const company = await companyForAppleTransaction(transaction);
  if (!company) throw new AppleSubscriptionError("APPLE_ACCOUNT_NOT_MAPPED", 404);
  const now = new Date();
  const graceEndsAt = renewal?.gracePeriodExpiresDate
    ? new Date(renewal.gracePeriodExpiresDate)
    : null;
  const graceIsActive = Boolean(graceEndsAt && graceEndsAt > now);
  const effectiveEndsAt = graceIsActive
    ? graceEndsAt!
    : transaction.expiresDate
      ? new Date(transaction.expiresDate)
      : now;
  const subscriptions = await prisma.subscription.findMany({
    where: {
      companyId: company.id,
      provider: "APPLE_APP_STORE",
      providerSubscriptionId: originalTransactionId,
      status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
    },
    select: { id: true },
  });
  if (!subscriptions.length) {
    return { active: graceIsActive, status: graceIsActive ? "PAST_DUE" : "EXPIRED", idempotent: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { id: { in: subscriptions.map(({ id }) => id) } },
      data: {
        status: graceIsActive ? "PAST_DUE" : "EXPIRED",
        endsAt: effectiveEndsAt,
        currentPeriodEndsAt: effectiveEndsAt,
        expiredAt: graceIsActive ? null : now,
        cancelAtPeriodEnd: renewal?.autoRenewStatus === 0,
      },
    });
    for (const subscription of subscriptions) {
      await tx.subscriptionEvent.create({
        data: {
          companyId: company.id,
          subscriptionId: subscription.id,
          type: graceIsActive ? "PAYMENT_FAILED" : "SUBSCRIPTION_EXPIRED",
          message: graceIsActive
            ? "Apple abonelik ödemesi yenilenemedi; faturalandırma ek süresi devam ediyor."
            : "Apple abonelik ödemesi yenilenemedi ve abonelik sona erdi.",
          metadata: {
            originalTransactionId,
            gracePeriodExpiresDate: renewal?.gracePeriodExpiresDate ?? null,
            correlationId: correlationId ?? null,
          },
        },
      });
    }
  });
  return { active: graceIsActive, status: graceIsActive ? "PAST_DUE" : "EXPIRED", idempotent: false };
}

export async function processAppleServerNotification(signedPayload: string) {
  const notification = await verifyAppleNotification(signedPayload);
  const notificationUUID = requiredText(notification.notificationUUID, "APPLE_NOTIFICATION_ID_MISSING");
  const notificationType = String(notification.notificationType ?? "UNKNOWN");
  const payloadHash = createHash("sha256").update(signedPayload).digest("hex");
  const existing = await prisma.billingWebhookReceipt.findUnique({
    where: { provider_eventId: { provider: "APPLE_APP_STORE", eventId: notificationUUID } },
  });
  if (existing?.processedAt) return { ok: true, duplicate: true };
  await prisma.billingWebhookReceipt.upsert({
    where: { provider_eventId: { provider: "APPLE_APP_STORE", eventId: notificationUUID } },
    create: {
      provider: "APPLE_APP_STORE",
      eventId: notificationUUID,
      eventType: notificationType,
      payloadHash,
    },
    update: { attempts: { increment: 1 }, payloadHash },
  });

  try {
    const signedTransactionInfo = notification.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      await prisma.billingWebhookReceipt.update({
        where: { provider_eventId: { provider: "APPLE_APP_STORE", eventId: notificationUUID } },
        data: { status: "IGNORED", processedAt: new Date() },
      });
      return { ok: true, ignored: true };
    }
    const transaction = await verifyAppleSignedTransaction(signedTransactionInfo);
    const renewal = notification.data?.signedRenewalInfo
      ? await verifyAppleRenewalInfo(notification.data.signedRenewalInfo)
      : null;
    const transactionExpired = Boolean(
      transaction.expiresDate && transaction.expiresDate <= Date.now(),
    );
    const result = notificationType === "DID_FAIL_TO_RENEW"
      ? await markAppleBillingRetry(transaction, renewal, notificationUUID)
      : TERMINAL_NOTIFICATION_TYPES.has(notificationType) || transactionExpired
        ? await closeAppleSubscription(transaction, notificationType, notificationUUID)
        : await activateVerifiedAppleTransaction({ transaction, correlationId: notificationUUID });

    if (renewal && transaction.originalTransactionId) {
      await prisma.subscription.updateMany({
        where: {
          provider: "APPLE_APP_STORE",
          providerSubscriptionId: transaction.originalTransactionId,
          status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
        },
        data: { cancelAtPeriodEnd: renewal.autoRenewStatus === 0 },
      });
    }
    await prisma.billingWebhookReceipt.update({
      where: { provider_eventId: { provider: "APPLE_APP_STORE", eventId: notificationUUID } },
      data: {
        status: "PROCESSED",
        providerPaymentId: transaction.transactionId,
        processedAt: new Date(),
        lastError: null,
      },
    });
    return { ok: true, duplicate: false, result };
  } catch (error) {
    await prisma.billingWebhookReceipt.update({
      where: { provider_eventId: { provider: "APPLE_APP_STORE", eventId: notificationUUID } },
      data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN" },
    });
    throw error;
  }
}

export function appleSubscriptionErrorStatus(error: unknown) {
  if (error instanceof AppleSubscriptionError) return error.status;
  if (error instanceof SubscriptionActivationError) return 409;
  return 500;
}
