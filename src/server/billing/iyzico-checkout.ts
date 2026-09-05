import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";

import { iyzicoConfiguration, IyzicoApiError, iyzicoPost } from "@/server/billing/iyzico-api";
import { evaluateCheckoutIdentity } from "@/server/billing/checkout-identity";
import {
  createIyzicoCallbackState,
  verifyIyzicoCallbackState,
  verifyIyzicoResponseSignature,
} from "@/server/billing/iyzico-checkout-signatures";
import { submitManualSubscriptionRequest } from "@/server/billing/manual-subscription-requests";
import { activateCompanySubscription } from "@/server/billing/subscription-activation";
import { prisma } from "@/server/db";

const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const CHECKOUT_TTL_SECONDS = 30 * 60;

type AcceptedDocument = {
  type: "PRE_INFORMATION_FORM" | "DISTANCE_SALES_AGREEMENT" | "REFUND_WITHDRAWAL_POLICY";
  version: string;
  hash: string;
};

type IyzicoInitializeResponse = {
  status?: string;
  errorCode?: string;
  conversationId?: string;
  token?: string;
  paymentPageUrl?: string;
  signature?: string;
};

type IyzicoRetrieveResponse = {
  status?: string;
  errorCode?: string;
  paymentStatus?: string;
  fraudStatus?: number;
  paymentId?: string | number;
  conversationId?: string;
  price?: string | number;
  paidPrice?: string | number;
  currency?: string;
  basketId?: string;
  token?: string;
  signature?: string;
};

export class IyzicoCheckoutError extends Error {
  constructor(
    code: string,
    public readonly httpStatus = 400,
  ) {
    super(code);
    this.name = "IyzicoCheckoutError";
  }
}

function requiredString(value: unknown, code = "IYZICO_RESPONSE_INVALID") {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new IyzicoCheckoutError(code, 502);
  }
  const normalized = String(value).trim();
  if (!normalized) throw new IyzicoCheckoutError(code, 502);
  return normalized;
}

function storedObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataString(value: Prisma.JsonValue | null | undefined, key: string) {
  const item = storedObject(value)[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeDecimal(value: string | number) {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/u.test(raw)) {
    throw new IyzicoCheckoutError("IYZICO_RESPONSE_INVALID", 502);
  }
  const [whole, fraction = ""] = raw.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, "");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function amountText(value: Prisma.Decimal) {
  return value.toFixed(2);
}

function clientIp(request: Request) {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized && isIP(normalized)) return normalized;
  }
  if (process.env.NODE_ENV !== "production") return "127.0.0.1";
  throw new IyzicoCheckoutError("IYZICO_CLIENT_IP_UNAVAILABLE", 400);
}

function normalizePhone(value: string) {
  const compact = value.replace(/[^\d+]/gu, "");
  const normalized = /^05\d{9}$/u.test(compact)
    ? `+9${compact}`
    : /^5\d{9}$/u.test(compact)
      ? `+90${compact}`
      : /^90\d{10}$/u.test(compact)
        ? `+${compact}`
        : compact;
  if (!/^\+[1-9]\d{9,14}$/u.test(normalized)) {
    throw new IyzicoCheckoutError("IYZICO_BILLING_PROFILE_INCOMPLETE", 422);
  }
  return normalized;
}

function profileValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "-" ? normalized : null;
}

export function iyzicoApplicationBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  const value = new URL(configured || new URL(request.url).origin);
  if (process.env.NODE_ENV === "production") {
    const trustedHost = value.hostname === "logivya.com" || value.hostname.endsWith(".logivya.com");
    if (value.protocol !== "https:" || !trustedHost) {
      throw new IyzicoCheckoutError("IYZICO_CALLBACK_URL_INVALID", 500);
    }
  } else if (!['http:', 'https:'].includes(value.protocol)) {
    throw new IyzicoCheckoutError("IYZICO_CALLBACK_URL_INVALID", 500);
  }
  value.pathname = "/";
  value.search = "";
  value.hash = "";
  return value;
}

function checkoutUrl(value: string) {
  const url = new URL(value);
  const trustedHost = url.hostname === "iyzipay.com" || url.hostname.endsWith(".iyzipay.com");
  if (url.protocol !== "https:" || !trustedHost) {
    throw new IyzicoCheckoutError("IYZICO_CHECKOUT_URL_INVALID", 502);
  }
  return url.toString();
}

export async function failIyzicoCheckout(paymentId: string, requestId: string, reason: string) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: { status: "FAILED", failedAt: now, failureReason: reason.slice(0, 120) },
    });
    const request = await tx.subscriptionRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== "AWAITING_PAYMENT" || request.activationSubscriptionId) return;
    await tx.subscriptionRequest.update({
      where: { id: request.id },
      data: {
        status: "DRAFT",
        paymentProvider: "MANUAL",
        immediatePerformanceConsentAt: null,
      },
    });
    await tx.subscriptionRequestTransition.create({
      data: {
        requestId: request.id,
        fromStatus: "AWAITING_PAYMENT",
        toStatus: "DRAFT",
        actorType: "SYSTEM",
        customerNote: reason.slice(0, 500),
      },
    });
  });
}

export async function initializeIyzicoCheckout(input: {
  requestId: string;
  companyId: string;
  userId: string;
  acceptedDocuments: AcceptedDocument[];
  immediatePerformanceConsent: true;
  correlationId: string;
  locale: string;
  request: Request;
}) {
  const [checkoutCandidate, profile] = await Promise.all([
    prisma.subscriptionRequest.findFirst({
      where: {
        id: input.requestId,
        companyId: input.companyId,
        requestedByUserId: input.userId,
      },
      include: { plan: true },
    }),
    prisma.companyBillingProfile.findUnique({ where: { companyId: input.companyId } }),
  ]);
  if (
    !checkoutCandidate
    || !checkoutCandidate.plan?.isActive
    || !["DRAFT", "AWAITING_PAYMENT"].includes(checkoutCandidate.status)
  ) throw new IyzicoCheckoutError("SUBSCRIPTION_REQUEST_STATE_CONFLICT", 409);
  if (!profile || profile.billingType !== "INDIVIDUAL") {
    throw new IyzicoCheckoutError("IYZICO_BILLING_PROFILE_INCOMPLETE", 422);
  }

  const buyer = storedObject(checkoutCandidate.buyerSnapshot);
  const identity = evaluateCheckoutIdentity({
    fullName: profile.fullName,
    email: profile.billingEmail,
  });
  const firstName = profileValue(identity.customer.firstName);
  const lastName = profileValue(identity.customer.lastName);
  const email = profileValue(identity.customer.email);
  const phone = profileValue(profile.billingPhone) || profileValue(String(buyer.phone || ""));
  const identityNumber = profileValue(profile.nationalIdNumber);
  const addressParts = [profile.addressLine1, profile.addressLine2, profile.district]
    .map(profileValue)
    .filter((value): value is string => Boolean(value));
  const address = addressParts.join(", ");
  const city = profileValue(profile.city);
  const rawCountry = profileValue(profile.country);
  const countryKey = rawCountry
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[İı]/gu, "I")
    .toUpperCase();
  const country = countryKey && ["TR", "TURKEY", "TURKIYE"].includes(countryKey)
    ? "Turkey"
    : rawCountry;
  if (
    !firstName
    || !lastName
    || !email
    || !/^\S+@\S+\.\S+$/u.test(email)
    || !phone
    || !identityNumber
    || identityNumber.length < 5
    || identityNumber.length > 64
    || !address
    || !city
    || !country
  ) throw new IyzicoCheckoutError("IYZICO_BILLING_PROFILE_INCOMPLETE", 422);
  const normalizedPhone = normalizePhone(phone);

  const submitted = await submitManualSubscriptionRequest({
    requestId: input.requestId,
    companyId: input.companyId,
    userId: input.userId,
    acceptedDocuments: input.acceptedDocuments,
    immediatePerformanceConsent: input.immediatePerformanceConsent,
    paymentProvider: "IYZICO",
    correlationId: input.correlationId,
    request: input.request,
  });

  const subscriptionRequest = await prisma.subscriptionRequest.findFirst({
    where: {
      id: input.requestId,
      companyId: input.companyId,
      requestedByUserId: input.userId,
    },
    include: { plan: true },
  });
  if (
    !subscriptionRequest
    || !subscriptionRequest.plan?.isActive
    || subscriptionRequest.status !== "AWAITING_PAYMENT"
    || subscriptionRequest.paymentProvider !== "IYZICO"
  ) throw new IyzicoCheckoutError("SUBSCRIPTION_REQUEST_STATE_CONFLICT", 409);

  const conversationId = randomUUID();
  const startsAt = new Date();
  const durationDays = subscriptionRequest.billingPeriod === "YEARLY" ? 365 : 30;
  const endsAt = new Date(startsAt.getTime() + durationDays * 86_400_000);
  const payment = await prisma.payment.create({
    data: {
      companyId: input.companyId,
      planId: subscriptionRequest.plan.id,
      provider: "IYZICO",
      providerPaymentId: conversationId,
      status: "PENDING",
      paymentMethod: "CREDIT_CARD",
      amount: subscriptionRequest.amount,
      currency: subscriptionRequest.currency,
      metadata: {
        manualRequestId: subscriptionRequest.id,
        billingPeriod: subscriptionRequest.billingPeriod,
        basketId: subscriptionRequest.publicId,
        requestPublicId: subscriptionRequest.publicId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        checkoutVersion: "IYZICO_CF_V1",
        correlationId: input.correlationId,
      },
    },
  });

  try {
    const { secretKey } = iyzicoConfiguration();
    const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS;
    const state = createIyzicoCallbackState(secretKey, payment.id, expiresAtEpochSeconds);
    const callback = new URL("/api/billing/iyzico/callback", iyzicoApplicationBaseUrl(input.request));
    callback.searchParams.set("state", state);
    const price = amountText(subscriptionRequest.amount);
    const response = await iyzicoPost<IyzicoInitializeResponse>(INITIALIZE_PATH, {
      locale: input.locale.toLowerCase().startsWith("tr") ? "tr" : "en",
      conversationId,
      price,
      paidPrice: price,
      currency: subscriptionRequest.currency.toUpperCase(),
      basketId: subscriptionRequest.publicId,
      paymentGroup: "SUBSCRIPTION",
      paymentChannel: "WEB",
      callbackUrl: callback.toString(),
      enabledInstallments: [1],
      buyer: {
        id: input.userId,
        name: firstName,
        surname: lastName,
        identityNumber,
        email,
        gsmNumber: normalizedPhone,
        registrationAddress: address,
        city,
        country,
        zipCode: profile.postalCode || undefined,
        ip: clientIp(input.request),
      },
      billingAddress: {
        contactName: `${firstName} ${lastName}`,
        city,
        country,
        address,
        zipCode: profile.postalCode || undefined,
      },
      basketItems: [{
        id: subscriptionRequest.publicId,
        price,
        name: `Logivya ${subscriptionRequest.planName} ${subscriptionRequest.billingPeriod}`,
        category1: "Yazılım",
        category2: "Abonelik",
        itemType: "VIRTUAL",
      }],
    });
    if (response.status !== "success") {
      throw new IyzicoCheckoutError("IYZICO_CHECKOUT_INITIALIZE_FAILED", 502);
    }
    const responseConversationId = requiredString(response.conversationId);
    const token = requiredString(response.token);
    const signature = requiredString(response.signature);
    if (
      responseConversationId !== conversationId
      || !verifyIyzicoResponseSignature(secretKey, signature, [responseConversationId, token])
    ) throw new IyzicoCheckoutError("IYZICO_RESPONSE_SIGNATURE_INVALID", 502);
    const paymentPageUrl = checkoutUrl(requiredString(response.paymentPageUrl));
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        metadata: {
          ...storedObject(payment.metadata),
          tokenHash: tokenHash(token),
          tokenExpiresAt: new Date(expiresAtEpochSeconds * 1000).toISOString(),
        },
      },
    });
    return {
      checkoutUrl: paymentPageUrl,
      paymentId: payment.id,
      request: submitted,
    };
  } catch (error) {
    const code = error instanceof IyzicoCheckoutError || error instanceof IyzicoApiError
      ? error.message
      : "IYZICO_CHECKOUT_INITIALIZE_FAILED";
    await failIyzicoCheckout(payment.id, subscriptionRequest.id, code).catch(() => undefined);
    if (error instanceof IyzicoCheckoutError) throw error;
    if (error instanceof IyzicoApiError) throw new IyzicoCheckoutError(error.message, error.httpStatus);
    throw new IyzicoCheckoutError("IYZICO_CHECKOUT_INITIALIZE_FAILED", 502);
  }
}

export async function completeIyzicoCheckout(input: {
  state: string;
  token: string;
  correlationId: string;
}) {
  const { secretKey } = iyzicoConfiguration();
  const verifiedState = verifyIyzicoCallbackState(secretKey, input.state);
  if (!verifiedState) throw new IyzicoCheckoutError("IYZICO_CALLBACK_STATE_INVALID", 401);
  return completeIyzicoCheckoutPayment({
    paymentId: verifiedState.paymentId,
    token: input.token,
    correlationId: input.correlationId,
  });
}

export async function completeIyzicoCheckoutPayment(input: {
  paymentId: string;
  token: string;
  correlationId: string;
}) {
  const { secretKey } = iyzicoConfiguration();
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: { plan: true, subscription: true },
  });
  if (!payment || payment.provider !== "IYZICO" || !payment.plan) {
    throw new IyzicoCheckoutError("PAYMENT_NOT_FOUND", 404);
  }
  if (["SUCCEEDED", "PAID"].includes(payment.status) && payment.subscription) {
    return { payment, subscription: payment.subscription, idempotent: true };
  }
  if (payment.status !== "PENDING") {
    throw new IyzicoCheckoutError("PAYMENT_STATE_CONFLICT", 409);
  }
  const metadata = storedObject(payment.metadata);
  const expectedTokenHash = metadataString(payment.metadata, "tokenHash");
  const manualRequestId = metadataString(payment.metadata, "manualRequestId");
  const basketId = metadataString(payment.metadata, "basketId");
  const billingPeriod = metadata.billingPeriod === "YEARLY" ? "YEARLY" : "MONTHLY";
  const startsAt = new Date(metadataString(payment.metadata, "startsAt") || "");
  const endsAt = new Date(metadataString(payment.metadata, "endsAt") || "");
  if (
    !expectedTokenHash
    || tokenHash(input.token) !== expectedTokenHash
    || !manualRequestId
    || !basketId
    || Number.isNaN(startsAt.getTime())
    || Number.isNaN(endsAt.getTime())
    || endsAt <= startsAt
  ) throw new IyzicoCheckoutError("PAYMENT_SCOPE_MISMATCH", 401);

  let response: IyzicoRetrieveResponse;
  try {
    response = await iyzicoPost<IyzicoRetrieveResponse>(RETRIEVE_PATH, {
      locale: "tr",
      conversationId: payment.providerPaymentId,
      token: input.token,
    });
  } catch (error) {
    if (error instanceof IyzicoApiError) {
      throw new IyzicoCheckoutError("IYZICO_PAYMENT_RETRIEVE_RETRYABLE", 503);
    }
    throw error;
  }

  const responsePaymentStatus = requiredString(response.paymentStatus);
  const externalPaymentId = requiredString(response.paymentId);
  const currency = requiredString(response.currency).toUpperCase();
  const responseBasketId = requiredString(response.basketId);
  const conversationId = requiredString(response.conversationId);
  const paidPriceRaw = requiredString(response.paidPrice);
  const priceRaw = requiredString(response.price);
  const responseToken = requiredString(response.token);
  const signature = requiredString(response.signature);
  const approved = response.status === "success"
    && responsePaymentStatus === "SUCCESS"
    && response.fraudStatus === 1;
  const signatureValid = verifyIyzicoResponseSignature(secretKey, signature, [
    responsePaymentStatus,
    externalPaymentId,
    currency,
    responseBasketId,
    conversationId,
    paidPriceRaw,
    priceRaw,
    responseToken,
  ]);
  const expectedAmount = normalizeDecimal(payment.amount.toString());
  const scopeValid = conversationId === payment.providerPaymentId
    && responseBasketId === basketId
    && responseToken === input.token
    && currency === payment.currency.toUpperCase()
    && normalizeDecimal(priceRaw) === expectedAmount
    && normalizeDecimal(paidPriceRaw) === expectedAmount;
  if (!approved || !signatureValid || !scopeValid) {
    const reason = !approved
      ? "IYZICO_PAYMENT_NOT_APPROVED"
      : !signatureValid
        ? "IYZICO_RESPONSE_SIGNATURE_INVALID"
        : "PAYMENT_SCOPE_MISMATCH";
    await failIyzicoCheckout(payment.id, manualRequestId, reason).catch(() => undefined);
    throw new IyzicoCheckoutError(reason, approved ? 401 : 409);
  }

  return activateCompanySubscription({
    companyId: payment.companyId,
    planSlug: payment.plan.slug,
    billingPeriod,
    startsAt,
    endsAt,
    source: "PAYMENT_PROVIDER",
    reason: "IYZICO Checkout Form verified callback",
    correlationId: input.correlationId,
    manualRequestId,
    payment: {
      mode: "CONFIRM_EXISTING",
      paymentId: payment.id,
      provider: "IYZICO",
      providerPaymentId: payment.providerPaymentId!,
      externalPaymentId,
      observedAmount: Number(paidPriceRaw),
      observedCurrency: currency,
      eventId: `IYZICO_CALLBACK:${externalPaymentId}`,
    },
  });
}
