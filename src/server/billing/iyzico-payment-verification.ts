import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { PaymentWebhookVerificationError } from "@/server/billing/payment-webhook-verification";

type IyzicoPaymentDetail = {
  status?: string;
  paymentStatus?: string;
  fraudStatus?: number;
  paymentId?: string | number;
  conversationId?: string;
  price?: string | number;
  paidPrice?: string | number;
  currency?: string;
  basketId?: string;
  signature?: string;
};

function secureEqual(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function required(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") throw new PaymentWebhookVerificationError("IYZICO_PAYMENT_DETAILS_UNVERIFIED");
  const normalized = String(value).trim();
  if (!normalized) throw new PaymentWebhookVerificationError("IYZICO_PAYMENT_DETAILS_UNVERIFIED");
  return normalized;
}

export function normalizeIyzicoDecimal(value: string | number) {
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new PaymentWebhookVerificationError("IYZICO_PAYMENT_DETAILS_UNVERIFIED");
  if (!raw.includes(".")) return raw.replace(/^(-?)0+(?=\d)/, "$1");
  const normalized = raw.replace(/0+$/, "").replace(/\.$/, "").replace(/^(-?)0+(?=\d)/, "$1");
  return normalized === "-0" ? "0" : normalized;
}

export function verifyIyzicoPaymentDetailResponse(
  detail: IyzicoPaymentDetail,
  input: { secretKey: string; paymentId: string; paymentConversationId: string },
) {
  if (detail.status !== "success" || detail.paymentStatus !== "SUCCESS" || detail.fraudStatus !== 1) {
    throw new PaymentWebhookVerificationError("IYZICO_PAYMENT_NOT_APPROVED");
  }
  const paymentId = required(detail.paymentId);
  const conversationId = required(detail.conversationId);
  const currency = required(detail.currency).toUpperCase();
  const basketId = required(detail.basketId);
  const paidPrice = normalizeIyzicoDecimal(required(detail.paidPrice));
  const price = normalizeIyzicoDecimal(required(detail.price));
  const signature = required(detail.signature).toLowerCase();
  if (paymentId !== input.paymentId || conversationId !== input.paymentConversationId) {
    throw new PaymentWebhookVerificationError("PAYMENT_SCOPE_MISMATCH");
  }
  const expected = createHmac("sha256", input.secretKey)
    .update([paymentId, currency, basketId, conversationId, paidPrice, price].join(":"))
    .digest("hex");
  if (!secureEqual(signature, expected)) throw new PaymentWebhookVerificationError("INVALID_PROVIDER_RESPONSE_SIGNATURE");
  const observedAmount = Number(paidPrice);
  if (!Number.isFinite(observedAmount) || observedAmount < 0) throw new PaymentWebhookVerificationError("IYZICO_PAYMENT_DETAILS_UNVERIFIED");
  return { observedAmount, observedCurrency: currency };
}

export async function retrieveAndVerifyIyzicoPayment(input: { paymentId: string; paymentConversationId: string }) {
  const apiKey = process.env.IYZICO_API_KEY;
  const secretKey = process.env.IYZICO_SECRET_KEY;
  if (!apiKey || !secretKey) throw new PaymentWebhookVerificationError("PAYMENT_WEBHOOK_NOT_CONFIGURED");

  const path = "/payment/detail";
  const body = JSON.stringify({ locale: "tr", paymentId: input.paymentId, paymentConversationId: input.paymentConversationId });
  const randomKey = `${Date.now()}${randomBytes(8).toString("hex")}`;
  const signature = createHmac("sha256", secretKey).update(`${randomKey}${path}${body}`).digest("hex");
  const authorization = Buffer.from(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`).toString("base64");
  const baseUrl = (process.env.IYZICO_API_URL || "https://api.iyzipay.com").replace(/\/$/, "");
  if (!baseUrl.startsWith("https://")) throw new PaymentWebhookVerificationError("IYZICO_API_URL_INVALID");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `IYZWSv2 ${authorization}`,
        "content-type": "application/json",
        "x-iyzi-rnd": randomKey,
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new PaymentWebhookVerificationError("IYZICO_PAYMENT_RETRIEVE_FAILED");
    const detail = await response.json() as IyzicoPaymentDetail;
    return verifyIyzicoPaymentDetailResponse(detail, { secretKey, ...input });
  } catch (error) {
    if (error instanceof PaymentWebhookVerificationError) throw error;
    throw new PaymentWebhookVerificationError("IYZICO_PAYMENT_RETRIEVE_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
