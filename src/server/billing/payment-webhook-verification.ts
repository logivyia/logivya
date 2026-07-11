import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentWebhookProvider = "IYZICO" | "PAYTR" | "STRIPE";

export type VerifiedPaymentWebhook = {
  provider: PaymentWebhookProvider;
  eventId: string;
  eventType: string;
  providerPaymentId: string;
  externalPaymentId?: string;
  status: "SUCCEEDED" | "FAILED" | "IGNORED";
  observedAmount?: number;
  observedCurrency?: string;
  failureReason?: string;
};

export class PaymentWebhookVerificationError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "PaymentWebhookVerificationError";
  }
}

function secureEqual(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requiredString(value: unknown, code = "INVALID_WEBHOOK_PAYLOAD") {
  if (typeof value !== "string" && typeof value !== "number") throw new PaymentWebhookVerificationError(code);
  const normalized = String(value).trim();
  if (!normalized) throw new PaymentWebhookVerificationError(code);
  return normalized;
}

function parseJsonObject(payload: string) {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed as Record<string, unknown>;
  } catch {
    throw new PaymentWebhookVerificationError("INVALID_WEBHOOK_PAYLOAD");
  }
}

export function verifyStripeWebhook(payload: string, signatureHeader: string | null, secret: string | undefined, now = Date.now()): VerifiedPaymentWebhook {
  if (!secret) throw new PaymentWebhookVerificationError("PAYMENT_WEBHOOK_NOT_CONFIGURED");
  if (!signatureHeader) throw new PaymentWebhookVerificationError("MISSING_SIGNATURE");
  const parts = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value).filter(Boolean);
  if (!timestamp || !signatures.length || !/^\d+$/.test(timestamp)) throw new PaymentWebhookVerificationError("INVALID_SIGNATURE");
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60_000) throw new PaymentWebhookVerificationError("STALE_WEBHOOK");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  if (!signatures.some((signature) => secureEqual(signature, expected))) throw new PaymentWebhookVerificationError("INVALID_SIGNATURE");

  const event = parseJsonObject(payload);
  const eventId = requiredString(event.id);
  const eventType = requiredString(event.type);
  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data as Record<string, unknown> : null;
  const object = data?.object && typeof data.object === "object" && !Array.isArray(data.object) ? data.object as Record<string, unknown> : null;
  if (!object) throw new PaymentWebhookVerificationError("INVALID_WEBHOOK_PAYLOAD");

  if (!["payment_intent.succeeded", "payment_intent.payment_failed", "checkout.session.completed"].includes(eventType)) {
    return { provider: "STRIPE", eventId, eventType, providerPaymentId: eventId, status: "IGNORED" };
  }
  const providerPaymentId = eventType === "checkout.session.completed"
    ? requiredString(object.payment_intent)
    : requiredString(object.id);
  const amountMinor = Number(eventType === "checkout.session.completed" ? object.amount_total : object.amount_received ?? object.amount);
  const observedAmount = Number.isFinite(amountMinor) ? amountMinor / 100 : undefined;
  const observedCurrency = typeof object.currency === "string" ? object.currency.toUpperCase() : undefined;
  if (eventType !== "payment_intent.payment_failed" && (observedAmount === undefined || !observedCurrency)) {
    throw new PaymentWebhookVerificationError("PAYMENT_AMOUNT_OR_CURRENCY_MISSING");
  }
  return {
    provider: "STRIPE",
    eventId,
    eventType,
    providerPaymentId,
    externalPaymentId: requiredString(object.id),
    status: eventType === "payment_intent.payment_failed" ? "FAILED" : "SUCCEEDED",
    observedAmount,
    observedCurrency,
    failureReason: eventType === "payment_intent.payment_failed" ? "STRIPE_PAYMENT_FAILED" : undefined,
  };
}

export function verifyPaytrWebhook(payload: string, merchantKey: string | undefined, merchantSalt: string | undefined): VerifiedPaymentWebhook {
  if (!merchantKey || !merchantSalt) throw new PaymentWebhookVerificationError("PAYMENT_WEBHOOK_NOT_CONFIGURED");
  const form = new URLSearchParams(payload);
  const providerPaymentId = requiredString(form.get("merchant_oid"));
  const status = requiredString(form.get("status"));
  if (status !== "success" && status !== "failed") throw new PaymentWebhookVerificationError("INVALID_WEBHOOK_PAYLOAD");
  const totalAmount = requiredString(form.get("total_amount"));
  const signature = requiredString(form.get("hash"), "MISSING_SIGNATURE");
  const expected = createHmac("sha256", merchantKey).update(`${providerPaymentId}${merchantSalt}${status}${totalAmount}`).digest("base64");
  if (!secureEqual(signature, expected)) throw new PaymentWebhookVerificationError("INVALID_SIGNATURE");
  const amountMinor = Number(totalAmount);
  if (!Number.isInteger(amountMinor) || amountMinor < 0) throw new PaymentWebhookVerificationError("INVALID_WEBHOOK_PAYLOAD");
  const rawCurrency = form.get("currency")?.trim().toUpperCase();
  const observedCurrency = rawCurrency === "TL" ? "TRY" : rawCurrency || "TRY";
  return {
    provider: "PAYTR",
    eventId: `PAYTR:${providerPaymentId}:${status}:${totalAmount}`,
    eventType: `payment.${status}`,
    providerPaymentId,
    status: status === "success" ? "SUCCEEDED" : "FAILED",
    observedAmount: amountMinor / 100,
    observedCurrency,
    failureReason: status === "success" ? undefined : form.get("failed_reason_msg") || "PAYTR_PAYMENT_FAILED",
  };
}

export function verifyIyzicoWebhook(payload: string, signatureHeader: string | null, secretKey: string | undefined): VerifiedPaymentWebhook {
  if (!secretKey) throw new PaymentWebhookVerificationError("PAYMENT_WEBHOOK_NOT_CONFIGURED");
  if (!signatureHeader) throw new PaymentWebhookVerificationError("MISSING_SIGNATURE");
  const event = parseJsonObject(payload);
  const eventType = requiredString(event.iyziEventType);
  const status = requiredString(event.status);
  const conversationId = requiredString(event.paymentConversationId);
  const directPaymentId = event.paymentId ? requiredString(event.paymentId) : null;
  const hppPaymentId = event.iyziPaymentId ? requiredString(event.iyziPaymentId) : null;
  let message: string;
  let externalPaymentId: string;
  if (directPaymentId) {
    externalPaymentId = directPaymentId;
    message = `${secretKey}${eventType}${directPaymentId}${conversationId}${status}`;
  } else if (hppPaymentId) {
    const token = requiredString(event.token);
    externalPaymentId = hppPaymentId;
    message = `${secretKey}${eventType}${hppPaymentId}${token}${conversationId}${status}`;
  } else {
    throw new PaymentWebhookVerificationError("INVALID_WEBHOOK_PAYLOAD");
  }
  const expected = createHmac("sha256", secretKey).update(message).digest("hex");
  if (!secureEqual(signatureHeader.toLowerCase(), expected.toLowerCase())) throw new PaymentWebhookVerificationError("INVALID_SIGNATURE");
  const eventId = typeof event.iyziReferenceCode === "string" && event.iyziReferenceCode.trim()
    ? event.iyziReferenceCode.trim()
    : `IYZICO:${conversationId}:${externalPaymentId}:${status}`;
  return {
    provider: "IYZICO",
    eventId,
    eventType,
    providerPaymentId: conversationId,
    externalPaymentId,
    status: status === "SUCCESS" ? "SUCCEEDED" : status === "FAILURE" ? "FAILED" : "IGNORED",
    failureReason: status === "FAILURE" ? "IYZICO_PAYMENT_FAILED" : undefined,
  };
}

export function verifyPaymentWebhook(provider: PaymentWebhookProvider, request: Request, payload: string) {
  if (provider === "STRIPE") return verifyStripeWebhook(payload, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  if (provider === "PAYTR") return verifyPaytrWebhook(payload, process.env.PAYTR_MERCHANT_KEY, process.env.PAYTR_MERCHANT_SALT);
  return verifyIyzicoWebhook(payload, request.headers.get("x-iyz-signature-v3"), process.env.IYZICO_SECRET_KEY);
}
