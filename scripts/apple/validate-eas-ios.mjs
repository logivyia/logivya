import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { EXPECTED_BUNDLE_ID, EXPECTED_TEAM_ID, repoRoot } from "./app-store-connect-client.mjs";

const mobileRoot = path.join(repoRoot, "apps", "mobile");
const easJson = JSON.parse(readFileSync(path.join(mobileRoot, "eas.json"), "utf8").replace(/^\uFEFF/u, ""));
const profile = easJson.build?.["ios-production"];
const inheritedProfile = easJson.build?.production || {};
const profileEnvironment = { ...(inheritedProfile.env || {}), ...(profile?.env || {}) };
const expectedMarketingVersion = String(profileEnvironment.EXPO_PUBLIC_APP_VERSION || "").trim();
const expoCli = path.join(mobileRoot, "node_modules", "expo", "bin", "cli");
const configResult = spawnSync(process.execPath, [expoCli, "config", "--json"], {
  cwd: mobileRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    ...profileEnvironment,
    APP_ENV: "production",
    EAS_BUILD_PROFILE: "ios-production",
    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID || EXPECTED_TEAM_ID,
  },
});

if (configResult.status !== 0) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Expo config resolution failed.",
      exitCode: configResult.status,
      processError: configResult.error?.code || null,
      diagnostic: String(configResult.stderr || "").trim().split(/\r?\n/u).slice(-3),
    }),
  );
  process.exit(2);
}

const config = JSON.parse(configResult.stdout);
const plugins = (config.plugins || []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
const firebasePlistPath = path.join(mobileRoot, "GoogleService-Info.plist");
const checks = [
  { name: "iOS production profile exists", ok: Boolean(profile) },
  { name: "Store distribution", ok: profile?.distribution === "store" },
  { name: "No development client", ok: profile?.developmentClient !== true },
  { name: "Device build, not simulator", ok: profile?.ios?.simulator === false },
  { name: "Bundle identifier", ok: config.ios?.bundleIdentifier === EXPECTED_BUNDLE_ID },
  { name: "Apple Team ID", ok: config.ios?.appleTeamId === EXPECTED_TEAM_ID },
  {
    name: `App Store marketing version ${expectedMarketingVersion}`,
    ok: Boolean(expectedMarketingVersion) && config.version === expectedMarketingVersion,
  },
  { name: "Numeric build number", ok: /^\d+$/u.test(String(config.ios?.buildNumber || "")) },
  { name: "Production environment", ok: config.extra?.environment === "production" },
  { name: "Non-exempt encryption declaration", ok: config.ios?.config?.usesNonExemptEncryption === false },
  {
    name: "Production App Transport Security",
    ok: config.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === false,
  },
  {
    name: "Expected iOS background modes",
    ok: sameStringSet(config.ios?.infoPlist?.UIBackgroundModes, ["remote-notification"]),
  },
  { name: "Expo notifications configured", ok: plugins.includes("expo-notifications") && Boolean(config.extra?.eas?.projectId) },
  {
    name: "Firebase iOS configuration",
    ok:
      !plugins.includes("@react-native-firebase/app") ||
      (existsSync(firebasePlistPath) && firebasePlistHasBundleId(firebasePlistPath, EXPECTED_BUNDLE_ID)),
  },
  { name: "Tablet support explicitly configured", ok: typeof config.ios?.supportsTablet === "boolean" },
  { name: "1024x1024 app icon present", ok: isExpectedPng(path.join(mobileRoot, config.icon || ""), 1024, 1024) },
];

const failed = checks.filter((check) => !check.ok);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      workflow: existsSync(path.join(mobileRoot, "ios")) ? "native/prebuild" : "Expo managed with EAS prebuild",
      version: config.version,
      buildNumber: config.ios?.buildNumber,
      bundleIdentifier: config.ios?.bundleIdentifier,
      appleTeamId: config.ios?.appleTeamId,
      checks,
      manualChecks: [
        "Inspect the generated PrivacyInfo.xcprivacy during the first EAS build.",
        "Confirm App Privacy answers and notification disclosures in App Store Connect.",
      ],
    },
    null,
    2,
  ),
);
if (failed.length > 0) process.exit(3);

function isExpectedPng(filePath, expectedWidth, expectedHeight) {
  if (!existsSync(filePath)) return false;
  const bytes = readFileSync(filePath);
  if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") return false;
  return bytes.readUInt32BE(16) === expectedWidth && bytes.readUInt32BE(20) === expectedHeight;
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== "string")) return false;
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

function firebasePlistHasBundleId(filePath, expectedBundleId) {
  const contents = readFileSync(filePath, "utf8");
  return new RegExp(
    `<key>\\s*BUNDLE_ID\\s*</key>\\s*<string>\\s*${escapeRegExp(expectedBundleId)}\\s*</string>`,
    "u",
  ).test(contents);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
