import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  GOOGLE_PLAY_PACKAGE_NAME,
  googlePlaySubscriptionOffer,
  googlePlaySubscriptionProductIds,
} from "@/server/billing/google-play-products";

assert.equal(GOOGLE_PLAY_PACKAGE_NAME, "com.logivya.mobile");
assert.deepEqual(googlePlaySubscriptionProductIds().sort(), [
  "logivya_professional",
  "logivya_starter",
]);

assert.deepEqual(googlePlaySubscriptionOffer("logivya_starter", "monthly"), {
  productId: "logivya_starter",
  basePlanId: "monthly",
  planSlug: "starter",
  billingPeriod: "MONTHLY",
  priceTry: 280,
});
assert.equal(googlePlaySubscriptionOffer("logivya_starter", "yearly")?.priceTry, 3000);
assert.equal(googlePlaySubscriptionOffer("logivya_professional", "monthly")?.priceTry, 380);
assert.equal(googlePlaySubscriptionOffer("logivya_professional", "yearly")?.priceTry, 4200);
assert.equal(googlePlaySubscriptionOffer("logivya_starter", "invalid"), null);

const root = process.cwd();
const appConfig = JSON.parse(
  readFileSync(path.join(root, "apps/mobile/app.json"), "utf8"),
) as {
  expo?: {
    version?: string;
    android?: { versionCode?: number };
    plugins?: unknown[];
  };
};
assert.equal(appConfig.expo?.plugins?.includes("expo-iap"), true);
assert.match(appConfig.expo?.version || "", /^\d+\.\d+\.\d+$/);
assert.ok(Number.isSafeInteger(appConfig.expo?.android?.versionCode));
assert.ok((appConfig.expo?.android?.versionCode || 0) > 0);

const easConfig = JSON.parse(
  readFileSync(path.join(root, "apps/mobile/eas.json"), "utf8").replace(/^\uFEFF/u, ""),
) as { build?: Record<string, { env?: Record<string, string> }> };
assert.equal(
  easConfig.build?.production?.env?.ANDROID_VERSION_CODE,
  String(appConfig.expo?.android?.versionCode),
);
assert.equal(
  easConfig.build?.production?.env?.EXPO_PUBLIC_APP_VERSION,
  appConfig.expo?.version,
);

const gradleSource = readFileSync(
  path.join(root, "apps/mobile/android/app/build.gradle"),
  "utf8",
);
assert.match(gradleSource, new RegExp(`versionCode\\s+${appConfig.expo?.android?.versionCode}`));
assert.match(gradleSource, new RegExp(`versionName\\s+"${appConfig.expo?.version?.replaceAll(".", "\\.")}"`));

const storeSource = readFileSync(
  path.join(
    root,
    "apps/mobile/src/features/subscription/google-play-subscription-store.tsx",
  ),
  "utf8",
);
assert.match(storeSource, /subscriptionOffers/);
assert.match(storeSource, /obfuscatedAccountId/);
assert.match(storeSource, /obfuscatedProfileId/);
const googleVerifyIndex = storeSource.indexOf("verifyGooglePlayPurchase");
const googleFinishIndex = storeSource.indexOf("finishTransaction({ purchase");
assert.ok(googleVerifyIndex >= 0 && googleFinishIndex > googleVerifyIndex);
assert.match(storeSource, /isUserCancelledPurchase/);
assert.doesNotMatch(storeSource, /IBAN|bank transfer|external purchase/iu);

const serverSource = readFileSync(
  path.join(root, "src/server/billing/google-play-subscriptions.ts"),
  "utf8",
);
assert.match(
  serverSource,
  /!identifiers\?\.obfuscatedExternalAccountId[\s\S]*GOOGLE_PLAY_ACCOUNT_SCOPE_MISMATCH/,
);
assert.match(
  serverSource,
  /!identifiers\?\.obfuscatedExternalProfileId[\s\S]*GOOGLE_PLAY_PROFILE_SCOPE_MISMATCH/,
);
assert.match(serverSource, /googlePlaySubscriptionOffer/);
assert.match(serverSource, /activateCompanySubscription/);
assert.match(serverSource, /planSlug/);
assert.match(serverSource, /billingPeriod/);
const googleActivateIndex = serverSource.indexOf("activateCompanySubscription");
const googleAcknowledgeIndex = serverSource.indexOf("acknowledgeGoogleSubscription");
assert.ok(
  googleActivateIndex >= 0 && googleAcknowledgeIndex > googleActivateIndex,
  "Google Play purchases must be verified and rights activated before acknowledgement",
);

const notificationRoute = readFileSync(
  path.join(root, "src/app/api/billing/google-play/notifications/route.ts"),
  "utf8",
);
assert.match(notificationRoute, /processGooglePlayDeveloperNotification/);

const catalogScript = readFileSync(
  path.join(root, "scripts/google-play/configure-google-play-subscriptions.mjs"),
  "utf8",
);
assert.match(catalogScript, /productId: "logivya_starter"/);
assert.match(catalogScript, /productId: "logivya_professional"/);
assert.match(catalogScript, /basePlanId: "monthly"/);
assert.match(catalogScript, /basePlanId: "yearly"/);
assert.match(catalogScript, /priceTry: 280/);
assert.match(catalogScript, /priceTry: 3000/);
assert.match(catalogScript, /priceTry: 380/);
assert.match(catalogScript, /priceTry: 4200/);
assert.match(catalogScript, /pricing:convertRegionPrices/);
assert.match(catalogScript, /regionsVersion\.version/);
assert.match(catalogScript, /:activate/);
assert.match(catalogScript, /Refusing to replace non-draft base plans/);

const migration = readFileSync(
  path.join(
    root,
    "prisma/migrations/20260805180000_google_play_subscriptions/migration.sql",
  ),
  "utf8",
);
assert.match(migration, /GOOGLE_PLAY/);
assert.match(migration, /GOOGLE_PLAY_BILLING/);

console.log(`Google Play Billing, exact entitlement, cancellation, and Android v${appConfig.expo?.android?.versionCode} contracts passed.`);
