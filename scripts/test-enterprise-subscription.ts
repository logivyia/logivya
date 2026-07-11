import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { CORE_PLAN_MATRIX } from "../src/server/billing/plan-matrix";
import { applyAdvertisingDeliveryPolicy } from "../src/server/messages/advertising-policy";
import { normalizeIyzicoDecimal, verifyIyzicoPaymentDetailResponse } from "../src/server/billing/iyzico-payment-verification";
import { assertPlanSeatCompatibility, SubscriptionActivationError } from "../src/server/billing/subscription-activation";
import {
  verifyIyzicoWebhook,
  verifyPaytrWebhook,
  verifyStripeWebhook,
} from "../src/server/billing/payment-webhook-verification";
import { companyInvitationErrorStatus, generateInvitationCode, normalizeInvitationCode } from "../src/server/team/company-invitations";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

assert.equal(CORE_PLAN_MATRIX.trial.totalUserSeats, 1);
assert.equal(CORE_PLAN_MATRIX.trial.contactMessaging, true);
assert.equal(CORE_PLAN_MATRIX.starter.monthlyPriceTry, 280);
assert.equal(CORE_PLAN_MATRIX.starter.totalUserSeats, 2);
assert.equal(CORE_PLAN_MATRIX.starter.contactMessaging, false);
assert.equal(CORE_PLAN_MATRIX.starter.advertisingEnabled, true);
assert.equal(CORE_PLAN_MATRIX.professional.monthlyPriceTry, 380);
assert.equal(CORE_PLAN_MATRIX.professional.totalUserSeats, 3);
assert.equal(CORE_PLAN_MATRIX.professional.contactMessaging, true);
assert.equal(CORE_PLAN_MATRIX.professional.advertisingEnabled, false);

const previousAttribution = process.env.MESSAGE_ADVERTISING_ATTRIBUTION_TEXT;
delete process.env.MESSAGE_ADVERTISING_ATTRIBUTION_TEXT;
assert.deepEqual(applyAdvertisingDeliveryPolicy("Mesaj", true), { content: "Mesaj", attributionApplied: false, attributionConfigured: false });
process.env.MESSAGE_ADVERTISING_ATTRIBUTION_TEXT = "Logivya ile gönderildi";
assert.equal(applyAdvertisingDeliveryPolicy("Mesaj", true).content, "Mesaj\n\nLogivya ile gönderildi");
assert.equal(applyAdvertisingDeliveryPolicy("Mesaj\n\nLogivya ile gönderildi", true).content, "Mesaj\n\nLogivya ile gönderildi");
assert.equal(applyAdvertisingDeliveryPolicy("Mesaj", false).content, "Mesaj");
if (previousAttribution === undefined) delete process.env.MESSAGE_ADVERTISING_ATTRIBUTION_TEXT;
else process.env.MESSAGE_ADVERTISING_ATTRIBUTION_TEXT = previousAttribution;

assert.doesNotThrow(() => assertPlanSeatCompatibility({ usedSeats: 2, targetSeatLimit: 2, planSlug: "starter" }));
assert.throws(
  () => assertPlanSeatCompatibility({ usedSeats: 3, targetSeatLimit: 2, planSlug: "starter" }),
  (error) => error instanceof SubscriptionActivationError
    && error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED"
    && error.details.usedSeats === 3
    && error.details.targetSeatLimit === 2,
);

for (let index = 0; index < 100; index += 1) {
  const code = generateInvitationCode();
  assert.match(code, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  assert.equal(normalizeInvitationCode(code), code.replaceAll("-", ""));
}
assert.equal(normalizeInvitationCode("abcd efgh-jklm-npqr"), "ABCDEFGHIJKLMNOPQR".replace(/[IO]/g, ""), "Normalization must remove separators and uppercase the code.");
assert.equal(companyInvitationErrorStatus("INVITATION_ALREADY_USED"), 409);
assert.equal(companyInvitationErrorStatus("SEAT_LIMIT_REACHED"), 409);
assert.equal(companyInvitationErrorStatus("RATE_LIMITED"), 429);

const stripeSecret = "whsec_enterprise_test";
const stripeTimestamp = 1_800_000_000;
const stripePayload = JSON.stringify({
  id: "evt_enterprise_1",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_enterprise_1", amount_received: 38_000, currency: "try" } },
});
const stripeSignature = createHmac("sha256", stripeSecret).update(`${stripeTimestamp}.${stripePayload}`).digest("hex");
const stripeEvent = verifyStripeWebhook(stripePayload, `t=${stripeTimestamp},v1=${stripeSignature}`, stripeSecret, stripeTimestamp * 1000);
assert.equal(stripeEvent.status, "SUCCEEDED");
assert.equal(stripeEvent.providerPaymentId, "pi_enterprise_1");
assert.equal(stripeEvent.observedAmount, 380);
assert.equal(stripeEvent.observedCurrency, "TRY");
assert.throws(() => verifyStripeWebhook(stripePayload, `t=${stripeTimestamp},v1=invalid`, stripeSecret, stripeTimestamp * 1000), /INVALID_SIGNATURE/);
assert.throws(() => verifyStripeWebhook(stripePayload, `t=${stripeTimestamp},v1=${stripeSignature}`, stripeSecret, (stripeTimestamp + 301) * 1000), /STALE_WEBHOOK/);

const paytrKey = "paytr-key";
const paytrSalt = "paytr-salt";
const paytrHash = createHmac("sha256", paytrKey).update(`order-1${paytrSalt}success28000`).digest("base64");
const paytrPayload = new URLSearchParams({ merchant_oid: "order-1", status: "success", total_amount: "28000", currency: "TL", hash: paytrHash }).toString();
const paytrEvent = verifyPaytrWebhook(paytrPayload, paytrKey, paytrSalt);
assert.equal(paytrEvent.status, "SUCCEEDED");
assert.equal(paytrEvent.observedAmount, 280);
assert.equal(paytrEvent.observedCurrency, "TRY");

const iyzicoSecret = "iyzico-secret";
const iyzicoPayload = JSON.stringify({
  iyziEventType: "PAYMENT_AUTH",
  status: "SUCCESS",
  paymentConversationId: "conversation-1",
  paymentId: "payment-1",
  iyziReferenceCode: "iyzi-event-1",
});
const iyzicoSignature = createHmac("sha256", iyzicoSecret).update(`${iyzicoSecret}PAYMENT_AUTHpayment-1conversation-1SUCCESS`).digest("hex");
const iyzicoEvent = verifyIyzicoWebhook(iyzicoPayload, iyzicoSignature, iyzicoSecret);
assert.equal(iyzicoEvent.status, "SUCCEEDED");
assert.equal(iyzicoEvent.providerPaymentId, "conversation-1");
assert.equal(normalizeIyzicoDecimal("380.00"), "380");
const iyzicoDetailSignature = createHmac("sha256", iyzicoSecret)
  .update("payment-1:TRY:basket-1:conversation-1:380:380")
  .digest("hex");
const iyzicoDetails = verifyIyzicoPaymentDetailResponse({
  status: "success",
  paymentStatus: "SUCCESS",
  fraudStatus: 1,
  paymentId: "payment-1",
  conversationId: "conversation-1",
  price: "380.00",
  paidPrice: "380.00",
  currency: "TRY",
  basketId: "basket-1",
  signature: iyzicoDetailSignature,
}, { secretKey: iyzicoSecret, paymentId: "payment-1", paymentConversationId: "conversation-1" });
assert.equal(iyzicoDetails.observedAmount, 380);
assert.equal(iyzicoDetails.observedCurrency, "TRY");

const activationSource = read("src/server/billing/subscription-activation.ts");
const adminActivationSource = read("src/app/api/admin/subscriptions/manual-activate/route.ts");
const webhookSource = read("src/server/billing/webhook-handler.ts");
assert(adminActivationSource.includes("activateSubscriptionManually"));
assert(webhookSource.includes("activateCompanySubscription"));
assert(activationSource.includes("TransactionIsolationLevel.Serializable"));
assert(activationSource.includes("DOWNGRADE_SEAT_RECONCILIATION_REQUIRED"));
assert(activationSource.includes("provider_providerPaymentId"));
assert(!webhookSource.includes('verification: "placeholder"'));

const invitationSource = read("src/server/team/company-invitations.ts");
assert(invitationSource.includes("shortCodeHash"));
assert(!/serializeCompanyInvitation[\s\S]{0,700}shortCodeHash/.test(invitationSource), "Serialized invitation lists must never expose credential hashes.");

console.log("Enterprise plan matrix, downgrade safety, secure invitation codes and signed payment webhook contracts passed.");
