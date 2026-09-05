import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createIyzicoCallbackState,
  createIyzicoResponseSignature,
  verifyIyzicoCallbackState,
  verifyIyzicoResponseSignature,
} from "../src/server/billing/iyzico-checkout-signatures";
import { verifyIyzicoWebhook } from "../src/server/billing/payment-webhook-verification";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const secret = "secretKey";
assert.equal(
  createIyzicoResponseSignature(secret, ["conversation-123", "token-456"]),
  "83a7246ee1bc82d2eaffb0ef4d40a895d6de855b64a5c9ee9356fd8fffbb5f00",
);
assert.equal(
  createIyzicoResponseSignature(secret, [
    "SUCCESS",
    "987654",
    "TRY",
    "BASKET-1",
    "conversation-123",
    "280",
    "280",
    "token-456",
  ]),
  "4d172807f4a9d18f956d285bfb13c0f04a7fb28b6ca75a81ffbee6b93582e3e2",
);
assert.equal(
  verifyIyzicoResponseSignature(
    secret,
    "83A7246EE1BC82D2EAFFB0EF4D40A895D6DE855B64A5C9EE9356FD8FFFBB5F00",
    ["conversation-123", "token-456"],
  ),
  true,
);
assert.equal(
  createIyzicoResponseSignature(
    "sandbox-qaIiLIxhjMgx3LSKIVvp6j17NunHOFtD",
    ["22416032", "TRY", "basketId", "conversationId", "10.5", "10.5"],
  ),
  "836c3a6c8db86c81043f2ca74edb13518b54a813f454f8dd762f0dd658610173",
);
assert.equal(
  verifyIyzicoResponseSignature(secret, "invalid", ["conversation-123", "token-456"]),
  false,
);
assert.equal(
  verifyIyzicoResponseSignature(
    secret,
    "g6ckbuG8gtLq/7DvTUColdbehVtkpcnuk1b9j/+7XwA=",
    ["conversation-123", "token-456"],
  ),
  false,
);

const now = 1_786_291_200;
const state = createIyzicoCallbackState(secret, "payment_123", now + 1_800);
assert.deepEqual(verifyIyzicoCallbackState(secret, state, now), {
  paymentId: "payment_123",
  expiresAtEpochSeconds: now + 1_800,
});
assert.equal(verifyIyzicoCallbackState(secret, `${state}x`, now), null);
assert.equal(
  verifyIyzicoCallbackState(
    secret,
    createIyzicoCallbackState(secret, "payment_123", now - 1),
    now,
  ),
  null,
);

const webhookPayload = JSON.stringify({
  iyziEventType: "API_AUTH",
  iyziPaymentId: "987654",
  token: "token-456",
  paymentConversationId: "conversation-123",
  status: "SUCCESS",
  iyziReferenceCode: "reference-1",
});
const webhookSignature = createHmac("sha256", secret)
  .update("secretKeyAPI_AUTH987654token-456conversation-123SUCCESS", "utf8")
  .digest("hex");
const webhook = verifyIyzicoWebhook(webhookPayload, webhookSignature, secret);
assert.equal(webhook.provider, "IYZICO");
assert.equal(webhook.providerPaymentId, "conversation-123");
assert.equal(webhook.externalPaymentId, "987654");
assert.equal(webhook.checkoutToken, "token-456");
assert.equal(webhook.status, "SUCCEEDED");
assert.throws(
  () => verifyIyzicoWebhook(webhookPayload, "0".repeat(64), secret),
  /INVALID_SIGNATURE/u,
);

const checkout = read("src/server/billing/iyzico-checkout.ts");
for (const contract of [
  "/payment/iyzipos/checkoutform/initialize/auth/ecom",
  "/payment/iyzipos/checkoutform/auth/ecom/detail",
  'paymentGroup: "SUBSCRIPTION"',
  'itemType: "VIRTUAL"',
  "verifyIyzicoResponseSignature",
  "tokenHash",
  "completeIyzicoCheckoutPayment",
  "PAYMENT_SCOPE_MISMATCH",
]) {
  assert(checkout.includes(contract), `Missing iyzico checkout contract: ${contract}`);
}
assert(!checkout.includes("cardNumber"));
assert(!checkout.includes("expireMonth"));
assert(!checkout.includes("expireYear"));
assert(!checkout.includes("cvc"));
assert(
  checkout.indexOf('const [checkoutCandidate, profile]')
    < checkout.indexOf('const submitted = await submitManualSubscriptionRequest'),
  "Billing profile must be validated before the request is moved to awaiting payment",
);

const subscriptionsPage = read("src/components/billing-subscriptions-page.tsx");
for (const contract of [
  'role="alert"',
  'href="/settings/payment"',
  "checkoutProfileIncomplete",
  '"Profile Incomplete": "billing.iyzico.profileIncomplete"',
]) {
  assert(subscriptionsPage.includes(contract), `Missing iyzico checkout UX contract: ${contract}`);
}

const membershipProfileRoute = read("src/app/api/settings/company/route.ts");
assert(!membershipProfileRoute.includes("companyBillingProfile"));
assert(!membershipProfileRoute.includes("billingType"));

const paymentProfileRoute = read("src/app/api/settings/payment-profile/route.ts");
assert(paymentProfileRoute.includes('billingType: "INDIVIDUAL"'));
assert(paymentProfileRoute.includes("legalName: null"));
assert(paymentProfileRoute.includes("tradeName: null"));
assert(paymentProfileRoute.includes("companyName: null"));

const compose = read("ops/vps/compose.app.yml");
const entrypoint = read("ops/vps/container-entrypoint.sh");
for (const secretName of ["iyzico_api_key", "iyzico_secret_key", "iyzico_merchant_id"]) {
  assert(compose.includes(`- ${secretName}`));
  assert(compose.includes(`${secretName}:`));
  assert(compose.includes(`/${secretName}`));
}
assert(entrypoint.includes("IYZICO_API_KEY /run/secrets/iyzico_api_key"));
assert(entrypoint.includes("IYZICO_SECRET_KEY /run/secrets/iyzico_secret_key"));
assert(entrypoint.includes("IYZICO_MERCHANT_ID /run/secrets/iyzico_merchant_id"));

const route = read("src/app/api/billing/iyzico/checkout/route.ts");
assert(route.includes("assertSubscriptionRequestCsrf"));
assert(route.includes("enforceOperationRateLimit"));
assert(route.includes("requireApiSession"));

const callback = read("src/app/api/billing/iyzico/callback/route.ts");
assert(callback.includes("completeIyzicoCheckout"));
assert(callback.includes("IYZICO_CALLBACK_TOO_LARGE"));
assert(callback.includes("status: 303"));
assert(callback.includes("iyzicoApplicationBaseUrl(request)"));
assert(
  !callback.includes('new URL("/settings/subscriptions", new URL(request.url).origin)'),
  "Hosted checkout result must not redirect users to the reverse proxy's internal origin",
);
assert(checkout.includes("export function iyzicoApplicationBaseUrl"));
assert(checkout.includes('value.protocol !== "https:" || !trustedHost'));

const legal = read("src/server/billing/manual-subscription-config.ts");
assert(legal.includes("iyzico güvenli ödeme sayfasında"));
assert(legal.includes("kart bilgileri LOGIVYA sunucularına gelmez"));
assert(legal.includes("otomatik yenileme talimatı oluşturulmaz"));

console.log("iyzico checkout contracts verified");
