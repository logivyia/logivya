import { createHash, createSign, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

import {
  GOOGLE_PLAY_PACKAGE_NAME,
  googlePlaySubscriptionOffer,
  googlePlaySubscriptionProduct,
  googlePlaySubscriptionProductIds,
} from "@/server/billing/google-play-products";
import {
  activateCompanySubscription,
  SubscriptionActivationError,
} from "@/server/billing/subscription-activation";
import { corePlanRule } from "@/server/billing/plan-matrix";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";
const ACTIVE_SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
] as const;
const ACTIVATABLE_GOOGLE_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
]);

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

type GoogleSubscriptionLineItem = {
  productId?: string;
  expiryTime?: string;
  latestSuccessfulOrderId?: string;
  autoRenewingPlan?: { autoRenewEnabled?: boolean };
  offerDetails?: {
    basePlanId?: string;
    offerId?: string;
    offerTags?: string[];
  };
};

type GoogleSubscriptionPurchase = {
  startTime?: string;
  regionCode?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, never>;
  externalAccountIdentifiers?: {
    externalAccountId?: string;
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  lineItems?: GoogleSubscriptionLineItem[];
};

type GoogleRtdnEnvelope = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

type GoogleDeveloperNotification = {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  testNotification?: { version?: string };
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export class GooglePlaySubscriptionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
    this.name = "GooglePlaySubscriptionError";
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function opaqueCompanyId(companyId: string) {
  return hash(`logivya:google-play:company:${companyId}`);
}

function opaqueUserId(userId: string) {
  return hash(`logivya:google-play:user:${userId}`);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function serviceAccountCredentials() {
  const configured = (
    process.env.GOOGLE_PLAY_BILLING_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON
  )?.trim();
  if (!configured)
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_CREDENTIALS_MISSING",
      503,
    );

  try {
    const json = configured.startsWith("{")
      ? configured
      : Buffer.from(configured, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<ServiceAccountCredentials>;
    if (!parsed.client_email || !parsed.private_key)
      throw new Error("INVALID_CREDENTIALS");
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
      token_uri: parsed.token_uri || GOOGLE_TOKEN_URL,
    } satisfies ServiceAccountCredentials;
  } catch (error) {
    logger.error("google_play_billing.credentials_invalid", error);
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_CREDENTIALS_INVALID",
      503,
    );
  }
}

async function googleAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt - Date.now() > 60_000) {
    return cachedAccessToken.token;
  }
  const credentials = serviceAccountCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: credentials.client_email,
      scope: GOOGLE_ANDROID_PUBLISHER_SCOPE,
      aud: credentials.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString("base64url")}`;

  const response = await fetch(credentials.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new GooglePlaySubscriptionError(
      `GOOGLE_PLAY_OAUTH_FAILED_${response.status}`,
      503,
    );
  }
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) {
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_OAUTH_INVALID_RESPONSE",
      503,
    );
  }
  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in || 3600) * 1000,
  };
  return cachedAccessToken.token;
}

async function googlePublisherRequest(path: string, init?: RequestInit) {
  const accessToken = await googleAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("content-type", "application/json");
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/${path}`,
    {
      ...init,
      headers,
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    logger.warn("google_play_billing.publisher_api_failed", {
      status: response.status,
      path,
      detail,
    });
    const status =
      response.status === 404
        ? 404
        : response.status === 401 || response.status === 403
          ? 503
          : 502;
    throw new GooglePlaySubscriptionError(
      `GOOGLE_PLAY_API_FAILED_${response.status}`,
      status,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

async function getGoogleSubscriptionPurchase(purchaseToken: string) {
  return googlePublisherRequest(
    `applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  ) as Promise<GoogleSubscriptionPurchase>;
}

async function acknowledgeGoogleSubscription(
  productId: string,
  purchaseToken: string,
) {
  await googlePublisherRequest(
    `applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

function parseDate(value: string | undefined, code: string) {
  if (!value) throw new GooglePlaySubscriptionError(code);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new GooglePlaySubscriptionError(code);
  return date;
}

function selectedLineItem(
  purchase: GoogleSubscriptionPurchase,
  expectedProductId?: string,
  expectedBasePlanId?: string,
) {
  const candidates = (purchase.lineItems || []).filter((lineItem) => {
    if (expectedProductId && lineItem.productId !== expectedProductId)
      return false;
    if (
      expectedBasePlanId &&
      lineItem.offerDetails?.basePlanId !== expectedBasePlanId
    )
      return false;
    return Boolean(
      googlePlaySubscriptionOffer(
        lineItem.productId,
        lineItem.offerDetails?.basePlanId,
      ),
    );
  });
  if (!candidates.length)
    throw new GooglePlaySubscriptionError("GOOGLE_PLAY_PRODUCT_NOT_ALLOWED");
  return candidates.sort((left, right) => {
    const rightExpiry = Date.parse(right.expiryTime || "") || 0;
    const leftExpiry = Date.parse(left.expiryTime || "") || 0;
    return rightExpiry - leftExpiry;
  })[0];
}

function purchaseMetadata(
  purchase: GoogleSubscriptionPurchase,
  lineItem: GoogleSubscriptionLineItem,
  purchaseToken: string,
): Prisma.InputJsonObject {
  return {
    productId: lineItem.productId || "",
    basePlanId: lineItem.offerDetails?.basePlanId || "",
    offerId: lineItem.offerDetails?.offerId || "",
    subscriptionState: purchase.subscriptionState || "",
    acknowledgementState: purchase.acknowledgementState || "",
    regionCode: purchase.regionCode || "",
    autoRenewEnabled: Boolean(lineItem.autoRenewingPlan?.autoRenewEnabled),
    testPurchase: Boolean(purchase.testPurchase),
    purchaseTokenHash: hash(purchaseToken),
  };
}

async function companyForGooglePurchase(purchaseToken: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { provider: "GOOGLE_PLAY", providerSubscriptionId: purchaseToken },
    orderBy: { createdAt: "desc" },
    select: { company: { select: { id: true, ownerId: true } } },
  });
  return subscription?.company || null;
}

async function usedCompanySeats(companyId: string) {
  const now = new Date();
  await prisma.companyInvitation.updateMany({
    where: { companyId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", reservedSeat: false },
  });
  const [activeMembers, invitedMembers, pendingInvitations] = await Promise.all(
    [
      prisma.companyUser.count({ where: { companyId, status: "ACTIVE" } }),
      prisma.companyUser.count({ where: { companyId, status: "INVITED" } }),
      prisma.companyInvitation.count({
        where: {
          companyId,
          status: "PENDING",
          reservedSeat: true,
          expiresAt: { gt: now },
        },
      }),
    ],
  );
  return activeMembers + invitedMembers + pendingInvitations;
}

export async function getGooglePlayPurchaseContext(input: {
  companyId: string;
  userId: string;
}) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, ownerId: true },
  });
  if (!company) throw new GooglePlaySubscriptionError("COMPANY_NOT_FOUND", 404);
  if (company.ownerId !== input.userId) {
    return {
      canPurchase: false,
      productIds: [] as string[],
      obfuscatedAccountId: null,
      obfuscatedProfileId: null,
      reason: "OWNER_REQUIRED",
    };
  }

  const usedSeats = await usedCompanySeats(company.id);
  const productIds = googlePlaySubscriptionProductIds().filter((productId) => {
    const product = googlePlaySubscriptionProduct(productId);
    const rule = product ? corePlanRule(product.planSlug) : null;
    return Boolean(rule && rule.totalUserSeats >= usedSeats);
  });

  return {
    canPurchase: true,
    productIds,
    obfuscatedAccountId: opaqueCompanyId(company.id),
    obfuscatedProfileId: opaqueUserId(input.userId),
    reason: null,
  };
}

async function activateVerifiedGooglePurchase(input: {
  purchase: GoogleSubscriptionPurchase;
  purchaseToken: string;
  expectedProductId?: string;
  expectedBasePlanId?: string;
  expectedCompanyId?: string;
  expectedUserId?: string;
  correlationId?: string;
}) {
  const state =
    input.purchase.subscriptionState || "SUBSCRIPTION_STATE_UNSPECIFIED";
  if (!ACTIVATABLE_GOOGLE_STATES.has(state)) {
    throw new GooglePlaySubscriptionError(`GOOGLE_PLAY_${state}`, 409);
  }
  const lineItem = selectedLineItem(
    input.purchase,
    input.expectedProductId,
    input.expectedBasePlanId,
  );
  const offer = googlePlaySubscriptionOffer(
    lineItem.productId,
    lineItem.offerDetails?.basePlanId,
  );
  if (!offer)
    throw new GooglePlaySubscriptionError("GOOGLE_PLAY_PRODUCT_NOT_ALLOWED");
  const startsAt = input.purchase.startTime
    ? parseDate(input.purchase.startTime, "GOOGLE_PLAY_START_DATE_MISSING")
    : new Date();
  const endsAt = parseDate(
    lineItem.expiryTime,
    "GOOGLE_PLAY_EXPIRY_DATE_MISSING",
  );
  if (endsAt <= new Date())
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_SUBSCRIPTION_EXPIRED",
      409,
    );

  const company = input.expectedCompanyId
    ? await prisma.company.findUnique({
        where: { id: input.expectedCompanyId },
        select: { id: true, ownerId: true },
      })
    : await companyForGooglePurchase(input.purchaseToken);
  if (!company)
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_ACCOUNT_NOT_MAPPED",
      403,
    );
  if (input.expectedUserId && company.ownerId !== input.expectedUserId) {
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_PURCHASE_OWNER_REQUIRED",
      403,
    );
  }

  const identifiers = input.purchase.externalAccountIdentifiers;
  if (
    input.expectedCompanyId &&
    (!identifiers?.obfuscatedExternalAccountId ||
      !secureEqual(
        identifiers.obfuscatedExternalAccountId,
        opaqueCompanyId(company.id),
      ))
  ) {
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_ACCOUNT_SCOPE_MISMATCH",
      403,
    );
  }
  if (
    input.expectedUserId &&
    (!identifiers?.obfuscatedExternalProfileId ||
      !secureEqual(
        identifiers.obfuscatedExternalProfileId,
        opaqueUserId(input.expectedUserId),
      ))
  ) {
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_PROFILE_SCOPE_MISMATCH",
      403,
    );
  }

  const providerPaymentId =
    lineItem.latestSuccessfulOrderId ||
    input.purchase.latestOrderId ||
    `google-play:${hash(input.purchaseToken)}`;
  const result = await activateCompanySubscription({
    companyId: company.id,
    planSlug: offer.planSlug,
    billingPeriod: offer.billingPeriod,
    startsAt,
    endsAt,
    source: "PAYMENT_PROVIDER",
    actorUserId: input.expectedUserId || company.ownerId,
    reason: "Google Play verified subscription",
    correlationId: input.correlationId,
    providerSubscriptionId: input.purchaseToken,
    payment: {
      mode: "CREATE",
      provider: "GOOGLE_PLAY",
      providerPaymentId,
      externalPaymentId: hash(input.purchaseToken),
      paymentMethod: "GOOGLE_PLAY_BILLING",
      currency: "TRY",
      customAmount: offer.priceTry,
      metadata: purchaseMetadata(input.purchase, lineItem, input.purchaseToken),
    },
  });

  const cancelAtPeriodEnd =
    state === "SUBSCRIPTION_STATE_CANCELED" ||
    lineItem.autoRenewingPlan?.autoRenewEnabled === false;
  if (cancelAtPeriodEnd || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
    await prisma.subscription.update({
      where: { id: result.subscription.id },
      data: {
        cancelAtPeriodEnd,
        status:
          state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
            ? "PAST_DUE"
            : result.subscription.status,
      },
    });
  }

  let acknowledged =
    input.purchase.acknowledgementState ===
    "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  if (!acknowledged) {
    try {
      await acknowledgeGoogleSubscription(offer.productId, input.purchaseToken);
      acknowledged = true;
    } catch (error) {
      logger.warn("google_play_billing.acknowledgement_failed", {
        productId: offer.productId,
        purchaseTokenHash: hash(input.purchaseToken),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    active: true,
    idempotent: result.idempotent,
    productId: offer.productId,
    basePlanId: offer.basePlanId,
    orderId: providerPaymentId,
    subscriptionId: result.subscription.id,
    status:
      state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
        ? "PAST_DUE"
        : result.subscription.status,
    endsAt: endsAt.toISOString(),
    acknowledged,
  };
}

export async function verifyAndActivateGooglePlayPurchase(input: {
  purchaseToken: string;
  productId: string;
  basePlanId?: string;
  companyId: string;
  userId: string;
  correlationId?: string;
}) {
  if (!googlePlaySubscriptionProduct(input.productId)) {
    throw new GooglePlaySubscriptionError("GOOGLE_PLAY_PRODUCT_NOT_ALLOWED");
  }
  const purchase = await getGoogleSubscriptionPurchase(input.purchaseToken);
  return activateVerifiedGooglePurchase({
    purchase,
    purchaseToken: input.purchaseToken,
    expectedProductId: input.productId,
    expectedBasePlanId: input.basePlanId,
    expectedCompanyId: input.companyId,
    expectedUserId: input.userId,
    correlationId: input.correlationId,
  });
}

async function updateNonActiveGoogleSubscription(input: {
  purchaseToken: string;
  purchase: GoogleSubscriptionPurchase;
  notificationType?: number;
  correlationId?: string;
}) {
  const state =
    input.purchase.subscriptionState || "SUBSCRIPTION_STATE_UNSPECIFIED";
  const now = new Date();
  const lineItem = selectedLineItem(input.purchase);
  const expiry = lineItem.expiryTime ? new Date(lineItem.expiryTime) : now;
  const status =
    state === "SUBSCRIPTION_STATE_EXPIRED"
      ? "EXPIRED"
      : state === "SUBSCRIPTION_STATE_REVOKED"
        ? "CANCELED"
        : "PAST_DUE";
  const subscriptions = await prisma.subscription.findMany({
    where: {
      provider: "GOOGLE_PLAY",
      providerSubscriptionId: input.purchaseToken,
      status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
    },
    select: { id: true, companyId: true },
  });
  if (!subscriptions.length) return { active: false, status, idempotent: true };

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { id: { in: subscriptions.map(({ id }) => id) } },
      data: {
        status,
        endsAt: expiry,
        currentPeriodEndsAt: expiry,
        expiredAt: status === "EXPIRED" ? now : undefined,
        cancelledAt: status === "CANCELED" ? now : undefined,
        cancelAtPeriodEnd: false,
      },
    });
    for (const subscription of subscriptions) {
      await tx.subscriptionEvent.create({
        data: {
          companyId: subscription.companyId,
          subscriptionId: subscription.id,
          type:
            status === "EXPIRED"
              ? "SUBSCRIPTION_EXPIRED"
              : status === "CANCELED"
                ? "SUBSCRIPTION_CANCELED"
                : "PAYMENT_FAILED",
          message:
            status === "PAST_DUE"
              ? "Google Play aboneligi odeme bekliyor."
              : "Google Play aboneligi sona erdi.",
          metadata: {
            subscriptionState: state,
            notificationType: input.notificationType || 0,
            correlationId: input.correlationId || "",
          },
        },
      });
    }
  });
  return { active: false, status, idempotent: false };
}

export async function processGooglePlayDeveloperNotification(
  envelope: GoogleRtdnEnvelope,
  correlationId?: string,
) {
  const encoded = envelope.message?.data;
  const eventId = envelope.message?.messageId;
  if (!encoded || !eventId)
    throw new GooglePlaySubscriptionError("GOOGLE_PLAY_NOTIFICATION_INVALID");
  let notification: GoogleDeveloperNotification;
  try {
    notification = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as GoogleDeveloperNotification;
  } catch {
    throw new GooglePlaySubscriptionError("GOOGLE_PLAY_NOTIFICATION_INVALID");
  }
  if (
    notification.packageName &&
    notification.packageName !== GOOGLE_PLAY_PACKAGE_NAME
  ) {
    throw new GooglePlaySubscriptionError("GOOGLE_PLAY_PACKAGE_MISMATCH", 403);
  }

  const payloadHash = hash(encoded);
  const eventType = notification.testNotification
    ? "TEST_NOTIFICATION"
    : `SUBSCRIPTION_${notification.subscriptionNotification?.notificationType || 0}`;
  try {
    await prisma.billingWebhookReceipt.create({
      data: {
        provider: "GOOGLE_PLAY",
        eventId,
        eventType,
        providerPaymentId:
          notification.subscriptionNotification?.subscriptionId,
        payloadHash,
      },
    });
  } catch (error) {
    const existing = await prisma.billingWebhookReceipt.findUnique({
      where: { provider_eventId: { provider: "GOOGLE_PLAY", eventId } },
    });
    if (
      existing?.payloadHash === payloadHash &&
      existing.status === "PROCESSED"
    ) {
      return { ok: true, duplicate: true };
    }
    if (existing?.payloadHash !== payloadHash) {
      throw new GooglePlaySubscriptionError(
        "GOOGLE_PLAY_NOTIFICATION_REPLAY_MISMATCH",
        409,
      );
    }
    if (!existing) throw error;
    await prisma.billingWebhookReceipt.update({
      where: { id: existing.id },
      data: { attempts: { increment: 1 }, status: "RECEIVED", lastError: null },
    });
  }

  try {
    if (notification.testNotification) {
      await prisma.billingWebhookReceipt.update({
        where: { provider_eventId: { provider: "GOOGLE_PLAY", eventId } },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      return { ok: true, test: true };
    }
    const purchaseToken = notification.subscriptionNotification?.purchaseToken;
    if (!purchaseToken)
      throw new GooglePlaySubscriptionError(
        "GOOGLE_PLAY_PURCHASE_TOKEN_MISSING",
      );
    const purchase = await getGoogleSubscriptionPurchase(purchaseToken);
    const result = ACTIVATABLE_GOOGLE_STATES.has(
      purchase.subscriptionState || "",
    )
      ? await activateVerifiedGooglePurchase({
          purchase,
          purchaseToken,
          correlationId,
        })
      : await updateNonActiveGoogleSubscription({
          purchase,
          purchaseToken,
          notificationType:
            notification.subscriptionNotification?.notificationType,
          correlationId,
        });
    await prisma.billingWebhookReceipt.update({
      where: { provider_eventId: { provider: "GOOGLE_PLAY", eventId } },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    return { ok: true, result };
  } catch (error) {
    await prisma.billingWebhookReceipt.update({
      where: { provider_eventId: { provider: "GOOGLE_PLAY", eventId } },
      data: {
        status: "FAILED",
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : String(error).slice(0, 500),
      },
    });
    throw error;
  }
}

export function assertGooglePlayNotificationSecret(request: Request) {
  const configured = process.env.GOOGLE_PLAY_RTDN_VERIFICATION_TOKEN?.trim();
  if (!configured) return;
  const supplied = new URL(request.url).searchParams.get("token") || "";
  if (!secureEqual(configured, supplied)) {
    throw new GooglePlaySubscriptionError(
      "GOOGLE_PLAY_NOTIFICATION_UNAUTHORIZED",
      401,
    );
  }
}

export function googlePlaySubscriptionErrorStatus(error: unknown) {
  if (error instanceof GooglePlaySubscriptionError) return error.status;
  if (error instanceof SubscriptionActivationError) return 409;
  return 500;
}
