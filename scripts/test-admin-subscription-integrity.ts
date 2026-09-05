import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { CANONICAL_SUBSCRIPTION_PLANS } from "../src/config/subscription-plans";
import { resolveAdminSeatIntegrity } from "../src/server/billing/admin-seat-integrity";
import { calendarMonthsAfter } from "../src/server/billing/admin-subscription-actions";
import { appleSubscriptionProduct } from "../src/server/billing/apple-store-products";
import { googlePlaySubscriptionOffer } from "../src/server/billing/google-play-products";
import { isFreePromotionalPayment } from "../src/server/billing/subscription-activation";

const root = process.cwd();
const baseline = {
  companyName: "Valid tenant",
  ownerEmail: "owner@example.com",
  hasOwnerMembership: true,
  hasActiveSubscription: false,
  hasAnySubscription: false,
  activePlanSlug: null,
  activePlanMaxTeamUsers: null,
  trialEntitlementStatus: "PENDING_IDENTITY",
  activeMembers: 1,
  suspendedMembers: 0,
  invitedMembers: 0,
  pendingInvitations: 0,
};

assert.equal(
  isFreePromotionalPayment({
    mode: "CREATE",
    provider: "MANUAL",
    providerPaymentId: "free-grant-test",
    paymentMethod: "FREE_PROMO",
    currency: "TRY",
  }),
  true,
);
assert.equal(
  isFreePromotionalPayment({
    mode: "CREATE",
    provider: "MANUAL",
    providerPaymentId: "paid-manual-test",
    paymentMethod: "MANUAL",
    currency: "TRY",
  }),
  false,
);

assert.equal(
  calendarMonthsAfter(new Date("2026-01-31T12:34:56.000Z"), 1).toISOString(),
  "2026-02-28T12:34:56.000Z",
);
assert.equal(
  calendarMonthsAfter(new Date("2028-01-31T12:34:56.000Z"), 1).toISOString(),
  "2028-02-29T12:34:56.000Z",
);

const pending = resolveAdminSeatIntegrity(baseline);
assert.equal(pending.used, 1);
assert.equal(pending.limit, 1);
assert.equal(pending.reconciliationRequired, false);
assert.equal(pending.configurationRequired, false);

const missingEntitlement = resolveAdminSeatIntegrity({ ...baseline, trialEntitlementStatus: null });
assert.equal(missingEntitlement.limit, 1);
assert.equal(missingEntitlement.integrityStatus, "CONFIGURATION_REQUIRED");
assert.equal(missingEntitlement.reconciliationRequired, false);

const starter = resolveAdminSeatIntegrity({
  ...baseline,
  hasActiveSubscription: true,
  hasAnySubscription: true,
  activePlanSlug: "starter",
  trialEntitlementStatus: null,
});
assert.deepEqual({ used: starter.used, limit: starter.limit, status: starter.integrityStatus }, { used: 1, limit: 2, status: "OK" });

const professional = resolveAdminSeatIntegrity({
  ...baseline,
  hasActiveSubscription: true,
  hasAnySubscription: true,
  activePlanSlug: "professional",
  trialEntitlementStatus: null,
});
assert.deepEqual({ used: professional.used, limit: professional.limit, status: professional.integrityStatus }, { used: 1, limit: 3, status: "OK" });

assert.equal(CANONICAL_SUBSCRIPTION_PLANS.starter.accountLimit, 2);
assert.equal(CANONICAL_SUBSCRIPTION_PLANS.professional.accountLimit, 3);
assert.equal(
  googlePlaySubscriptionOffer("logivya_starter", "monthly")?.planSlug,
  "starter",
);
assert.equal(
  googlePlaySubscriptionOffer("logivya_professional", "monthly")?.planSlug,
  "professional",
);
assert.equal(
  appleSubscriptionProduct("com.logivya.mobile.starter.monthly")?.planSlug,
  "starter",
);
assert.equal(
  appleSubscriptionProduct("com.logivya.mobile.professional.monthly")?.planSlug,
  "professional",
);

const overLimit = resolveAdminSeatIntegrity({
  ...baseline,
  hasActiveSubscription: true,
  hasAnySubscription: true,
  activePlanSlug: "starter",
  trialEntitlementStatus: null,
  activeMembers: 3,
});
assert.equal(overLimit.reconciliationRequired, true);
assert.equal(overLimit.integrityStatus, "RECONCILIATION_REQUIRED");

const retired = resolveAdminSeatIntegrity({
  ...baseline,
  companyName: "Retired production auth smoke tenant",
  ownerEmail: "retired-auth-smoke-1@invalid.logivya.com",
});
assert.deepEqual({ used: retired.used, limit: retired.limit, status: retired.integrityStatus }, { used: 0, limit: 0, status: "RETIRED" });

const syntheticProof = resolveAdminSeatIntegrity({
  ...baseline,
  companyName: "Production Mixed MFA Proof's company",
  ownerEmail: "auth-proof-1@logivya.invalid",
});
assert.equal(syntheticProof.integrityStatus, "RETIRED");

const registration = source("src/app/api/auth/register/route.ts");
assert.match(registration, /companyUser\.create/);
assert.match(registration, /lifecycleState:\s*"INDEPENDENT_OWNER"/);
assert.match(registration, /createPendingTrialEntitlement/);

const listing = source("src/app/api/admin/companies/route.ts");
assert.match(listing, /resolveAdminSeatIntegrity/);
assert.match(listing, /includeRetired/);
assert.doesNotMatch(listing, /maxTeamUsers\s*\?\?\s*0/);
assert.match(listing, /id:\s*currentSubscription!\.id/);
assert.match(listing, /slug:\s*currentSubscription!\.plan\.slug/);

const ui = source("src/components/admin-subscriptions-page.tsx");
assert.match(ui, /isFreeAdminGrant/);
assert.match(
  ui,
  /pendingAction\.action === "ACTIVATE"[\s\S]*pendingAction\.action === "CHANGE_PLAN"/,
);
assert.match(ui, /isFreeAdminGrant[\s\S]*"\/api\/admin\/subscriptions\/manual-activate"/);
assert.match(ui, /companyId:\s*pendingAction\.company\.id/);
assert.match(ui, /billingPeriod:\s*"MONTHLY"/);
assert.match(ui, /paymentMethod:\s*"FREE_PROMO"/);
assert.match(ui, /createPayment:\s*true/);
assert.match(ui, /defaultValue="professional"/);
assert.match(ui, /adminSubscriptions\.freeGrantNotice/);
assert.match(ui, /ADMIN_GRANT_PLAN_OPTIONS/);
assert.match(ui, /PURCHASABLE_SUBSCRIPTION_PLAN_CODES/);
assert.match(ui, /plan\.accountLimit/);
assert.match(ui, /localDateTimeToUtcIso/);
assert.match(ui, /startsAt:\s*localDateTimeToUtcIso/);
assert.match(ui, /endsAt:\s*localDateTimeToUtcIso/);
assert.match(ui, /reauthenticateAdmin/);
assert.match(ui, /name="adminPassword"/);
assert.match(ui, /availableSubscriptionActions/);
assert.match(ui, /\["ACTIVE", "TRIALING"\]/);
assert.match(ui, /adminSubscriptions\.configurationRequired/);
assert.match(ui, /href=\{`\/admin\/companies\/\$\{company\.id\}`\}/);
assert.match(ui, /name="extensionDays"/);

const actionRoute = source("src/app/api/admin/subscriptions/[id]/action/route.ts");
assert.match(actionRoute, /extensionDays/);
assert.match(actionRoute, /performAdminSubscriptionAction/);
assert.match(actionRoute, /error:\s*error\.code/);
assert.match(actionRoute, /durationMonths/);

const reauthRoute = source("src/app/api/admin/security/re-auth/route.ts");
assert.match(reauthRoute, /requirePlatformAdmin\("admin\.dashboard\.read"/);
assert.match(reauthRoute, /platformAdmin\.upsert/);

const actionService = source("src/server/billing/admin-subscription-actions.ts");
assert.match(actionService, /extensionBase/);
assert.match(actionService, /status:\s*"SUSPENDED"/);
assert.match(actionService, /status:\s*"CANCELED"/);
assert.match(actionService, /activateCompanySubscription/);
assert.match(actionService, /paymentMethod:\s*"FREE_PROMO"/);
assert.match(actionService, /calendarMonthsAfter/);

const manualActivation = source("src/app/api/admin/subscriptions/manual-activate/route.ts");
assert.match(manualActivation, /createPayment/);
assert.match(manualActivation, /activateCompanySubscription/);
assert.match(manualActivation, /paymentMethod\s*===\s*"FREE_PROMO"/);
assert.match(manualActivation, /z\.iso\.datetime\(\{\s*offset:\s*true\s*\}\)/);
assert.doesNotMatch(manualActivation, /startsAt:\s*z\.coerce\.date/);

const activation = source("src/server/billing/subscription-activation.ts");
assert.match(activation, /!isFreePromotionalPayment\(input\.payment\)/);
assert.match(activation, /freePromotionalGrant/);

const details = source("src/app/(platform)/admin/companies/[id]/page.tsx");
assert.match(details, /trialEntitlements/);
assert.match(details, /invitations/);
assert.match(details, /subscriptionAuditLogs/);

const repair = source("scripts/repair-admin-subscription-integrity.ts");
assert.match(repair, /process\.argv\.includes\("--apply"\)/);
assert.match(repair, /if \(!apply\)/);
assert.match(repair, /companyUser\.upsert/);
assert.match(repair, /trialEntitlement\.upsert/);
assert.doesNotMatch(repair, /burakidim@gmail\.com/i);

const lifecycle = source("scripts/test-admin-subscription-lifecycle-integration.ts");
assert.match(lifecycle, /registered-no-package/);
assert.match(lifecycle, /starter-active/);
assert.match(lifecycle, /professional-active/);
assert.match(lifecycle, /suspended/);
assert.match(lifecycle, /reactivated/);
assert.match(lifecycle, /canceled/);
assert.match(lifecycle, /activated-again/);
assert.match(lifecycle, /unrelatedTenantUnchanged/);

console.log("Admin subscription integrity regression tests passed.");

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
