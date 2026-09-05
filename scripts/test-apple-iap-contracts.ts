import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  APPLE_SUBSCRIPTION_PRODUCTS,
  appleSubscriptionProduct,
  appleSubscriptionProductIds,
} from "@/server/billing/apple-store-products";
import { isMobileSelfRegistrationAllowed } from "@/server/mobile/registration-policy";
import { mobileRegistrationSchema } from "@/server/mobile/registration-schema";

const registration = {
  name: "Apple Review",
  email: "appstore-review@logivya.com",
  phone: "05393565142",
  password: "LogivyaReview1!",
  passwordConfirmation: "LogivyaReview1!",
  termsAccepted: true as const,
  privacyAccepted: true as const,
  kvkkAccepted: true as const,
  deviceId: "ios-review-device",
};

assert.equal(
  mobileRegistrationSchema.safeParse({ ...registration, platform: "IOS" }).success,
  true,
  "iOS self-registration must validate with the same required identity fields",
);
assert.equal(
  mobileRegistrationSchema.safeParse({ ...registration, platform: "IOS", phone: undefined }).success,
  true,
  "iOS self-registration must remain available without a phone number",
);
assert.equal(isMobileSelfRegistrationAllowed("IOS"), true);
assert.equal(
  mobileRegistrationSchema.safeParse({
    ...registration,
    platform: "ANDROID",
  }).success,
  true,
);
assert.equal(
  mobileRegistrationSchema.safeParse({
    ...registration,
    platform: "ANDROID",
    phone: undefined,
  }).success,
  false,
  "Android registration must continue requiring a phone number",
);
assert.equal(isMobileSelfRegistrationAllowed("ANDROID"), true);

const productIds = appleSubscriptionProductIds().sort();
assert.deepEqual(productIds, [
  "com.logivya.mobile.professional.monthly",
  "com.logivya.mobile.professional.yearly",
  "com.logivya.mobile.starter.monthly",
  "com.logivya.mobile.starter.yearly",
]);
assert.equal(Object.keys(APPLE_SUBSCRIPTION_PRODUCTS).length, 4);
assert.deepEqual(appleSubscriptionProduct("com.logivya.mobile.starter.monthly"), {
  planSlug: "starter",
  billingPeriod: "MONTHLY",
});
assert.equal(appleSubscriptionProduct("com.logivya.mobile.invalid"), null);

const root = process.cwd();
const appConfig = JSON.parse(
  readFileSync(path.join(root, "apps/mobile/app.json"), "utf8"),
) as {
  expo?: {
    version?: string;
    ios?: { buildNumber?: string };
    android?: { versionCode?: number };
    plugins?: unknown[];
  };
};
assert.equal(appConfig.expo?.plugins?.includes("expo-iap"), true);
assert.match(appConfig.expo?.version || "", /^\d+\.\d+\.\d+$/);
assert.match(appConfig.expo?.ios?.buildNumber || "", /^\d+$/);
assert.ok(Number.isSafeInteger(appConfig.expo?.android?.versionCode));

const easConfig = JSON.parse(
  readFileSync(path.join(root, "apps/mobile/eas.json"), "utf8").replace(/^\uFEFF/u, ""),
) as { build?: Record<string, { env?: Record<string, string> }> };
assert.equal(easConfig.build?.production?.env?.IOS_BUILD_NUMBER, appConfig.expo?.ios?.buildNumber);
const iosReleaseEnv = easConfig.build?.["ios-production"]?.env;
assert.match(iosReleaseEnv?.IOS_BUILD_NUMBER || "", /^\d+$/);
assert.ok(Number(iosReleaseEnv?.IOS_BUILD_NUMBER) >= Number(appConfig.expo?.ios?.buildNumber));
assert.match(iosReleaseEnv?.EXPO_PUBLIC_APP_VERSION || "", /^\d+\.\d+\.\d+$/);
assert.ok(iosReleaseEnv?.EXPO_PUBLIC_BUILD_MARKER?.endsWith(`_V${iosReleaseEnv.IOS_BUILD_NUMBER}`));

const storeSource = readFileSync(
  path.join(root, "apps/mobile/src/features/subscription/apple-subscription-store.tsx"),
  "utf8",
);
assert.match(storeSource, /getAvailablePurchasesFromStore/);
const appleVerifyIndex = storeSource.indexOf("verifyApplePurchase(purchase.purchaseToken)");
const appleFinishIndex = storeSource.indexOf("finishTransaction({ purchase");
assert.ok(appleVerifyIndex >= 0 && appleFinishIndex > appleVerifyIndex);
assert.match(storeSource, /isUserCancelledPurchase/);
assert.doesNotMatch(storeSource, /IBAN|bank transfer|external purchase/iu);
assert.match(
  storeSource,
  /https:\/\/www\.apple\.com\/legal\/internet-services\/itunes\/dev\/stdeula\//,
);

const authNavigator = readFileSync(
  path.join(root, "apps/mobile/src/navigation/auth-navigator.tsx"),
  "utf8",
);
assert.match(authNavigator, /<Stack\.Screen name="Register"/);
assert.doesNotMatch(authNavigator, /Platform\.OS/);

const linkingSource = readFileSync(
  path.join(root, "apps/mobile/src/navigation/linking.ts"),
  "utf8",
);
assert.match(linkingSource, /Register: "register"/);
assert.doesNotMatch(linkingSource, /Platform\.OS/);

const loginSource = readFileSync(
  path.join(root, "apps/mobile/src/screens/auth/login-screen.tsx"),
  "utf8",
);
assert.match(loginSource, /KeyboardAvoidingView/);
assert.match(loginSource, /Keyboard\.dismiss/);
assert.match(loginSource, /passwordInputRef/);
assert.match(loginSource, /navigation\.navigate\("Register"/);

const registerSource = readFileSync(
  path.join(root, "apps/mobile/src/screens/auth/register-screen.tsx"),
  "utf8",
);
assert.match(registerSource, /KeyboardAvoidingView/);
assert.match(registerSource, /phone/);
assert.match(registerSource, /register\(/);
assert.match(registerSource, /phoneRequired\s*=\s*Platform\.OS\s*!==\s*"ios"/);
assert.equal(
  existsSync(
    path.join(root, "apps/mobile/src/screens/auth/register-screen.ios.tsx"),
  ),
  false,
  "The former iOS login-only registration shim must remain removed",
);

const authServiceSource = readFileSync(
  path.join(root, "apps/mobile/src/auth/auth-service.ts"),
  "utf8",
);
assert.doesNotMatch(authServiceSource, /Account creation is not available in the iOS app/);
assert.doesNotMatch(authServiceSource, /allowsWorkspaceEnrollment\s*=\s*getMobilePlatform\(\)\s*!==\s*"IOS"/);

const localeSource = readFileSync(
  path.join(root, "apps/mobile/src/i18n/config.ts"),
  "utf8",
);
assert.match(localeSource, /Europe\/Istanbul/);
assert.match(localeSource, /regionCode.*TR/s);

const messagingSource = readFileSync(
  path.join(root, "apps/mobile/src/screens/app/messaging-screen.tsx"),
  "utf8",
);
assert.match(messagingSource, /selectAllContacts|allContacts|Tüm kişileri seç/iu);

const mobileRegistrationRoute = readFileSync(
  path.join(root, "src/app/api/mobile/auth/register/route.ts"),
  "utf8",
);
assert.doesNotMatch(mobileRegistrationRoute, /REGISTRATION_UNAVAILABLE_ON_IOS/);
assert.match(mobileRegistrationRoute, /platform:\s*parseMobilePlatform\(input\.platform\)/);
assert.match(mobileRegistrationRoute, /data:\s*\{\s*name: user\.name\.trim\(\),\s*ownerId: user\.id/);

const appleServerSource = readFileSync(
  path.join(root, "src/server/billing/apple-subscriptions.ts"),
  "utf8",
);
assert.match(appleServerSource, /appleSubscriptionProduct/);
assert.match(appleServerSource, /activateCompanySubscription/);
assert.match(appleServerSource, /planSlug/);
assert.match(appleServerSource, /billingPeriod/);

const appStoreMetadata = JSON.parse(
  readFileSync(
    path.join(root, "packages/docs/production-release/apple/app-store-metadata.json"),
    "utf8",
  ),
) as {
  version: string;
  primaryLocale: string;
  localizations: Record<string, {
    description: string;
    whatsNew: string;
    reviewNotes: string;
  }>;
};
assert.equal(appStoreMetadata.version, iosReleaseEnv?.EXPO_PUBLIC_APP_VERSION);
for (const locale of ["en-US", "tr-TR"]) {
  const localized = appStoreMetadata.localizations[locale];
  assert.match(
    localized.description,
    /https:\/\/www\.apple\.com\/legal\/internet-services\/itunes\/dev\/stdeula\//,
  );
  // Release notes describe this release, not a permanently required old feature list.
  assert.ok(localized.whatsNew.trim().length >= 20 && localized.whatsNew.length <= 4000);
  assert.doesNotMatch(localized.whatsNew, /TODO|PLACEHOLDER|\uFFFD/);
}
const primaryReviewNotes =
  appStoreMetadata.localizations[appStoreMetadata.primaryLocale].reviewNotes;
assert.ok(primaryReviewNotes.includes(`Version ${iosReleaseEnv?.EXPO_PUBLIC_APP_VERSION} / ${iosReleaseEnv?.IOS_BUILD_NUMBER}`)
  || new RegExp(`build ${iosReleaseEnv?.IOS_BUILD_NUMBER}`, "i").test(primaryReviewNotes));
assert.match(primaryReviewNotes, /registration can be completed/i);
assert.match(primaryReviewNotes, /without a phone number/i);
assert.match(primaryReviewNotes, /no external payment/i);
assert.match(primaryReviewNotes, /StoreKit/i);

const releasePreparationSource = readFileSync(
  path.join(root, "scripts/apple/prepare-app-store-release.mjs"),
  "utf8",
);
assert.match(releasePreparationSource, /appStoreReviewDetail/);
assert.match(releasePreparationSource, /appStoreReviewDetails/);
assert.match(releasePreparationSource, /attributes: \{ notes: reviewNotes \}/);
assert.match(releasePreparationSource, /"1\.0\.1"/);

const migration = readFileSync(
  path.join(
    root,
    "prisma/migrations/20260804190000_apple_app_store_subscriptions/migration.sql",
  ),
  "utf8",
);
assert.match(migration, /APPLE_APP_STORE/);
assert.match(migration, /APPLE_IN_APP_PURCHASE/);
assert.match(migration, /appleAppAccountToken/);

console.log("Apple IAP, iOS registration, keyboard, locale, and contact selection contracts passed.");
