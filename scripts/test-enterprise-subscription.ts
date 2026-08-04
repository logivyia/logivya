import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { CORE_PLAN_CODES, CORE_PLAN_MATRIX, PURCHASABLE_PLAN_CODES } from "../src/server/billing/plan-matrix";
import { applyAdvertisingDeliveryPolicy, LOGIVYA_MESSAGE_ATTRIBUTION_TEXT } from "../src/server/messages/advertising-policy";
import { normalizeIyzicoDecimal, verifyIyzicoPaymentDetailResponse } from "../src/server/billing/iyzico-payment-verification";
import { assertPlanSeatCompatibility, SubscriptionActivationError } from "../src/server/billing/subscription-activation";
import {
  verifyIyzicoWebhook,
  verifyPaytrWebhook,
  verifyStripeWebhook,
} from "../src/server/billing/payment-webhook-verification";
import { companyInvitationErrorStatus } from "../src/server/team/company-invitations";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

assert.equal(CORE_PLAN_MATRIX.trial.totalUserSeats, 1);
assert.equal(CORE_PLAN_MATRIX.trial.whatsappConnections, 1);
assert.equal(CORE_PLAN_MATRIX.trial.contactMessaging, true);
assert.equal(CORE_PLAN_MATRIX.starter.monthlyPriceTry, 280);
assert.equal(CORE_PLAN_MATRIX.starter.totalUserSeats, 2);
assert.equal(CORE_PLAN_MATRIX.starter.whatsappConnections, 2);
assert.equal(CORE_PLAN_MATRIX.starter.contactMessaging, true);
assert.equal(CORE_PLAN_MATRIX.starter.advertisingEnabled, true);
assert.equal(CORE_PLAN_MATRIX.professional.monthlyPriceTry, 380);
assert.equal(CORE_PLAN_MATRIX.professional.totalUserSeats, 3);
assert.equal(CORE_PLAN_MATRIX.professional.whatsappConnections, 3);
assert.equal(CORE_PLAN_MATRIX.professional.contactMessaging, true);
assert.equal(CORE_PLAN_MATRIX.professional.advertisingEnabled, false);
assert.deepEqual([...CORE_PLAN_CODES], ["trial", "starter", "professional"]);
assert.deepEqual([...PURCHASABLE_PLAN_CODES], ["starter", "professional"]);

delete process.env.MESSAGE_ADVERTISING_ATTRIBUTION_TEXT;
assert.equal(LOGIVYA_MESSAGE_ATTRIBUTION_TEXT, "Bu mesaj logivya.com üzerinden gönderilmiştir.");
assert.deepEqual(applyAdvertisingDeliveryPolicy("Mesaj", true), {
  content: `Mesaj\n\n${LOGIVYA_MESSAGE_ATTRIBUTION_TEXT}`,
  attributionApplied: true,
  attributionConfigured: true,
});
assert.equal(applyAdvertisingDeliveryPolicy(`Mesaj\n\n${LOGIVYA_MESSAGE_ATTRIBUTION_TEXT}`, true).content, `Mesaj\n\n${LOGIVYA_MESSAGE_ATTRIBUTION_TEXT}`);
assert.equal(applyAdvertisingDeliveryPolicy("Mesaj", false).content, "Mesaj");

assert.doesNotThrow(() => assertPlanSeatCompatibility({ usedSeats: 2, targetSeatLimit: 2, planSlug: "starter" }));
assert.throws(
  () => assertPlanSeatCompatibility({ usedSeats: 3, targetSeatLimit: 2, planSlug: "starter" }),
  (error) => error instanceof SubscriptionActivationError
    && error.message === "DOWNGRADE_SEAT_RECONCILIATION_REQUIRED"
    && error.details.usedSeats === 3
    && error.details.targetSeatLimit === 2,
);

assert.equal(companyInvitationErrorStatus("INVITATION_ALREADY_USED"), 409);
assert.equal(companyInvitationErrorStatus("INVITATION_ALREADY_PENDING"), 409);
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
const stripeRefundPayload = JSON.stringify({
  id: "evt_enterprise_refund",
  type: "charge.refunded",
  data: { object: { id: "ch_enterprise_1", payment_intent: "pi_enterprise_1", amount_refunded: 38_000, currency: "try" } },
});
const stripeRefundSignature = createHmac("sha256", stripeSecret).update(`${stripeTimestamp}.${stripeRefundPayload}`).digest("hex");
const stripeRefund = verifyStripeWebhook(stripeRefundPayload, `t=${stripeTimestamp},v1=${stripeRefundSignature}`, stripeSecret, stripeTimestamp * 1000);
assert.equal(stripeRefund.status, "REFUNDED");
assert.equal(stripeRefund.providerPaymentId, "pi_enterprise_1");
const stripeChargebackPayload = JSON.stringify({
  id: "evt_enterprise_chargeback",
  type: "charge.dispute.created",
  data: { object: { id: "dp_enterprise_1", payment_intent: "pi_enterprise_1", amount: 38_000, currency: "try" } },
});
const stripeChargebackSignature = createHmac("sha256", stripeSecret).update(`${stripeTimestamp}.${stripeChargebackPayload}`).digest("hex");
assert.equal(verifyStripeWebhook(stripeChargebackPayload, `t=${stripeTimestamp},v1=${stripeChargebackSignature}`, stripeSecret, stripeTimestamp * 1000).status, "CHARGEBACK");

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
const adminActionSource = read("src/app/api/admin/subscriptions/[id]/action/route.ts");
const billingPlansSource = read("src/app/api/billing/plans/route.ts");
const billingUpgradeSource = read("src/app/api/billing/request-upgrade/route.ts");
const mobileBillingUpgradeSource = read("src/app/api/mobile/subscription/request-upgrade/route.ts");
const billingPageSource = read("src/components/billing-subscriptions-page.tsx");
const webhookSource = read("src/server/billing/webhook-handler.ts");
assert(adminActivationSource.includes("activateSubscriptionManually"));
assert(adminActivationSource.includes("PURCHASABLE_PLAN_CODES"));
assert(adminActionSource.includes("PURCHASABLE_PLAN_CODES"));
assert(billingPlansSource.includes("CORE_PLAN_CODES"));
assert(billingUpgradeSource.includes("PURCHASABLE_PLAN_CODES"));
assert(mobileBillingUpgradeSource.includes("PURCHASABLE_PLAN_CODES"));
assert(!billingPageSource.includes('plan.slug === "enterprise"'));
assert(webhookSource.includes("activateCompanySubscription"));
assert(webhookSource.includes('event.status === "REFUNDED" || event.status === "CHARGEBACK"'));
assert(activationSource.includes("TransactionIsolationLevel.Serializable"));
assert(activationSource.includes("DOWNGRADE_SEAT_RECONCILIATION_REQUIRED"));
assert(activationSource.includes("provider_providerPaymentId"));
assert(!webhookSource.includes('verification: "placeholder"'));

const invitationSource = read("src/server/team/company-invitations.ts");
assert(invitationSource.includes("shortCodeHash: null"));
assert(invitationSource.includes("queueInvitationDelivery"));
assert(invitationSource.includes("resendCompanyInvitation"));
assert(!/serializeCompanyInvitation[\s\S]{0,700}shortCodeHash/.test(invitationSource), "Serialized invitation lists must never expose credential hashes.");

console.log("Enterprise plan matrix, downgrade safety, one-time invitation links and signed payment webhook contracts passed.");
