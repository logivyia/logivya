import assert from "node:assert/strict";

import {
  normalizeMfaStatus,
  normalizeMobileSubscriptionResponse,
} from "../apps/mobile/src/api/mobile-response-normalizers";

const mfa = normalizeMfaStatus({
  enabled: true,
  methods: null,
});

assert.equal(mfa.enabled, true);
assert.deepEqual(mfa.methods, []);

const mobileSubscription = normalizeMobileSubscriptionResponse({
  subscription: {
    status: "ACTIVE",
    entitlements: null,
    lockedFeatures: null,
  },
  entitlements: null,
  plans: [
    {
      id: "starter",
      code: "STARTER",
      slug: "starter",
      currency: "TRY",
      monthlyPrice: 28000,
      yearlyPrice: 280000,
      yearlyMonthlyEquivalent: 23333,
      trialDays: 0,
      featureCodes: null,
      billingIntervals: null,
      limits: null,
      features: null,
      active: true,
      sortOrder: 1,
    },
  ],
});

assert.equal(mobileSubscription.plans.length, 1);
assert.deepEqual(mobileSubscription.plans[0]?.featureCodes, []);
assert.deepEqual(mobileSubscription.plans[0]?.billingIntervals, []);
assert.deepEqual(mobileSubscription.plans[0]?.limits, {
  accounts: 0,
  whatsappConnections: 0,
});
assert.equal(
  mobileSubscription.subscription?.entitlements?.contactMessaging,
  false,
);

console.log("Mobile security/subscription resilience tests passed.");
