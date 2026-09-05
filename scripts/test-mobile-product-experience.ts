import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const parseJson = (source: string) => JSON.parse(source.replace(/^\uFEFF/u, ""));

const [
  settings,
  rootNavigator,
  onboarding,
  settingsScreen,
  translations,
  appJsonSource,
  easJsonSource,
  gradle,
  trListingSource,
  enListingSource,
  assetManifestSource,
] = [
  read("apps/mobile/src/auth/settings-store.ts"),
  read("apps/mobile/src/navigation/root-navigator.tsx"),
  read("apps/mobile/src/screens/onboarding/onboarding-screen.tsx"),
  read("apps/mobile/src/screens/app/settings-screen.tsx"),
  read("apps/mobile/src/i18n/translations.ts"),
  read("apps/mobile/app.json"),
  read("apps/mobile/eas.json"),
  read("apps/mobile/android/app/build.gradle"),
  read("packages/docs/google-play/store-listing-tr-TR.json"),
  read("packages/docs/google-play/store-listing-en-US.json"),
  read("packages/docs/google-play/store-assets-v178/asset-manifest.json"),
];

assert.match(settings, /SETTINGS_STORAGE_VERSION = 4/);
assert.match(settings, /onboardingCompleted: false/);
assert.match(settings, /completeOnboarding/);
assert.match(settings, /restartOnboarding/);
assert.match(settings, /hydrated: false/);
assert.match(rootNavigator, /settingsHydrated/);
assert.match(rootNavigator, /<OnboardingScreen \/>/);
assert.match(onboarding, /whatsappAccounts/);
assert.match(onboarding, /categoriesTitle/);
assert.match(onboarding, /notificationPreferences/);
assert.match(onboarding, /onboardingStart/);
assert.match(settingsScreen, /navigate\("NotificationPreferences"\)/);
assert.match(settingsScreen, /restartOnboarding/);
assert.doesNotMatch(translations, /feedbackDescription: "[^"]*(Kapalı test|closed testing)/iu);
assert.match(translations, /onboardingControlDescription/);

const appJson = parseJson(appJsonSource);
const easJson = parseJson(easJsonSource);
assert.match(appJson.expo.version, /^\d+\.\d+\.\d+$/u);
assert.ok(Number.isInteger(appJson.expo.android.versionCode) && appJson.expo.android.versionCode > 0);
assert.match(appJson.expo.extra.buildMarker, new RegExp(`V${appJson.expo.android.versionCode}$`, "u"));
assert.equal(easJson.build.production.env.ANDROID_VERSION_CODE, String(appJson.expo.android.versionCode));
assert.equal(easJson.build.production.env.EXPO_PUBLIC_APP_VERSION, appJson.expo.version);
assert.match(gradle, new RegExp(`versionCode ${appJson.expo.android.versionCode}`));
assert.match(gradle, new RegExp(`versionName "${appJson.expo.version.replaceAll(".", "\\.")}"`));

for (const source of [trListingSource, enListingSource]) {
  const listing = parseJson(source);
  assert.ok(listing.shortDescription.length <= 80);
  assert.ok(listing.fullDescription.length <= 4000);
  assert.doesNotMatch(listing.fullDescription, /Facebook Pages|Telegram/iu, "Public store copy must not expose non-PUBLIC provider features");
}
assert.match(parseJson(trListingSource).fullDescription, /canlı lojistik pazarı/i);
assert.match(parseJson(trListingSource).fullDescription, /yük, araç ve şoför/i);
assert.match(parseJson(trListingSource).fullDescription, /iki adımlı/i);

const assetManifest = parseJson(assetManifestSource);
assert.equal(assetManifest.outputs.length, 8);
for (const output of assetManifest.outputs) {
  assert.equal(output.width, 1080);
  assert.equal(output.height, 1920);
}
assert.ok(assetManifest.outputs.some((output: { file: string }) => output.file.includes("notifications")));
assert.ok(assetManifest.outputs.some((output: { file: string }) => output.file.includes("security")));

console.log("Mobile product experience contract passed.");
