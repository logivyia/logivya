import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { canPrepareDraftWhileInReview } from "./draft-build-policy.mjs";
import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const mobileRoot = path.join(repoRoot, "apps", "mobile");
const requireNewBuild = process.argv.includes("--new-build");
const draftOnly = requireNewBuild && process.argv.includes("--draft-while-in-review");

try {
  const configuration = loadAppleConfiguration();
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
    },
  });
  if (configResult.status !== 0) throw new Error("Effective Expo iOS configuration could not be resolved.");
  const expoConfig = JSON.parse(configResult.stdout);

  const [appResult, versionsResult, buildsResult] = await Promise.all([
    appStoreConnectRequest(configuration, `/v1/apps/${configuration.appStoreAppId}`),
    appStoreConnectRequest(configuration, `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`, { limit: 50 }),
    appStoreConnectRequest(configuration, "/v1/builds", {
      "filter[app]": configuration.appStoreAppId,
      include: "preReleaseVersion",
      limit: 100,
    }),
  ]);

  const app = appResult.payload?.data;
  const versions = versionsResult.payload?.data || [];
  const targetVersion = versions.find(
    (version) =>
      version.attributes?.versionString === expectedMarketingVersion && version.attributes?.platform === "IOS",
  );
  const selectedBuildResult = targetVersion
    ? await appStoreConnectRequest(configuration, `/v1/appStoreVersions/${targetVersion.id}/build`)
    : null;
  const selectedBuildNumber = Number(selectedBuildResult?.payload?.data?.attributes?.version);
  const buildNumbers = (buildsResult.payload?.data || [])
    .map((build) => Number(build.attributes?.version))
    .filter((value) => Number.isSafeInteger(value));
  const maximumUploadedBuild = buildNumbers.length ? Math.max(...buildNumbers) : 0;
  const candidateBuild = Number(expoConfig.ios?.buildNumber);
  const candidateIsNew = Number.isSafeInteger(candidateBuild) && candidateBuild > maximumUploadedBuild;
  const candidateIsSelectedForVersion =
    Number.isSafeInteger(candidateBuild) && candidateBuild === selectedBuildNumber;
  const candidateIsSelectedForReview =
    candidateIsSelectedForVersion &&
    targetVersion?.attributes?.appStoreState !== "PREPARE_FOR_SUBMISSION";
  const firebasePath = path.join(mobileRoot, "GoogleService-Info.plist");
  const easIdentityCommand =
    process.platform === "win32"
      ? { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npx eas-cli whoami"] }
      : { command: "npx", args: ["eas-cli", "whoami"] };
  const easIdentity = spawnSync(easIdentityCommand.command, easIdentityCommand.args, {
    cwd: mobileRoot,
    encoding: "utf8",
  });
  const legalUrls = await Promise.all(
    [
      "https://www.logivya.com/privacy-policy",
      "https://www.logivya.com/terms-of-service",
      "https://www.logivya.com",
      "https://www.logivya.com/account-deletion",
    ].map(checkPublicUrl),
  );
  const releaseDocsRoot = resolveReleaseDocsRoot();
  const metadataPath = path.join(releaseDocsRoot, "app-store-metadata.json");
  const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, "utf8")) : null;
  const primaryMetadata = metadata?.localizations?.["en-US"];

  const buildChecks = [
    check("App Store app identity", app?.id === configuration.appStoreAppId),
    check("App Store bundle identifier", app?.attributes?.bundleId === configuration.bundleId),
    check("App Store primary locale", app?.attributes?.primaryLocale === "en-US"),
    check(
      `App Store version ${expectedMarketingVersion}`,
      (draftOnly && canPrepareDraftWhileInReview(versions, expectedMarketingVersion)) || versions.some(
        (version) =>
          version.attributes?.versionString === expectedMarketingVersion && version.attributes?.platform === "IOS",
      ),
    ),
    check("EAS account authentication", easIdentity.status === 0),
    check("iOS store profile", profile?.distribution === "store" && profile?.ios?.simulator === false),
    check("No development client", profile?.developmentClient !== true),
    check("Effective marketing version", expoConfig.version === expectedMarketingVersion),
    check("Effective bundle identifier", expoConfig.ios?.bundleIdentifier === configuration.bundleId),
    check("Effective Apple Team ID", expoConfig.ios?.appleTeamId === configuration.teamId),
    check(
      "Production App Transport Security",
      expoConfig.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === false,
    ),
    check(
      "Expected iOS background modes",
      sameStringSet(expoConfig.ios?.infoPlist?.UIBackgroundModes, ["remote-notification"]),
    ),
    check(
      requireNewBuild ? "New build number exceeds App Store maximum" : "Unique or selected version build number",
      requireNewBuild ? candidateIsNew : candidateIsNew || candidateIsSelectedForVersion,
    ),
    check(
      "Firebase iOS configuration",
      existsSync(firebasePath) && firebasePlistHasBundleId(firebasePath, configuration.bundleId),
    ),
    ...legalUrls.map(({ url, ok }) => check(`Public URL ${url}`, ok)),
    check("Metadata targets the verified app", metadata?.appStoreAppId === configuration.appStoreAppId),
    check("Promotional text character limit", textLengthBetween(primaryMetadata?.promotionalText, 1, 170)),
    check("Description character limit", textLengthBetween(primaryMetadata?.description, 1, 4_000)),
    check("Keywords character limit", textLengthBetween(primaryMetadata?.keywords, 1, 100)),
    check("What's New character limit", textLengthBetween(primaryMetadata?.whatsNew, 1, 4_000)),
  ];

  const documentationChecks = [
    "app-store-metadata.json",
    "app-privacy-questionnaire.md",
    "app-store-screenshot-matrix.md",
    "testflight-test-plan.md",
    "app-review-account.md",
    "apple-release-runbook.md",
  ].map((fileName) =>
    check(
      `Release documentation ${fileName}`,
      existsSync(path.join(releaseDocsRoot, fileName)),
    ),
  );
  const blockers = [...buildChecks, ...documentationChecks].filter((item) => !item.ok).map((item) => item.name);
  const reviewStates = new Set(["WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_APPLE_RELEASE", "PENDING_DEVELOPER_RELEASE"]);
  const appReviewReady = blockers.length === 0
    && candidateIsSelectedForReview
    && reviewStates.has(targetVersion?.attributes?.appStoreState);

  console.log(
    JSON.stringify(
      {
        target: {
          mode: requireNewBuild ? "NEW_BUILD" : "AUDIT",
          draftOnly,
          appStoreAppId: configuration.appStoreAppId,
          bundleIdentifier: configuration.bundleId,
          appleTeamId: configuration.teamId,
          environment: "production",
          marketingVersion: expoConfig.version,
          candidateBuildNumber: expoConfig.ios?.buildNumber,
        },
        appStore: {
          state: targetVersion?.attributes?.appStoreState,
          maximumUploadedBuild,
          selectedBuildNumber: Number.isSafeInteger(selectedBuildNumber) ? selectedBuildNumber : null,
        },
        buildChecks,
        documentationChecks,
        warnings: [
          expoConfig.ios?.supportsTablet
            ? "iPad support is enabled; verified iPad screenshots and layout testing are required before App Review."
            : "iPad support is disabled; confirm this is the approved product decision.",
          "Distribution certificate, provisioning profile, APNs entitlement, and generated PrivacyInfo.xcprivacy require verification during the first EAS build.",
          "App Privacy answers, reviewer credentials, screenshots, agreements, and subscription-policy review require human approval before App Review.",
        ],
        blockers,
        goForFirstTestFlightBuild: blockers.length === 0,
        appReviewReady,
      },
      null,
      2,
    ),
  );
  if (blockers.length > 0) process.exitCode = 3;
} catch (error) {
  if (error instanceof AppleConfigurationError) {
    console.error(JSON.stringify({ goForFirstTestFlightBuild: false, error: error.message }));
    process.exit(2);
  }
  if (error instanceof AppStoreConnectError) {
    console.error(
      JSON.stringify({ goForFirstTestFlightBuild: false, httpStatus: error.status, errorCodes: error.codes }),
    );
    process.exit(3);
  }
  console.error(
    JSON.stringify({
      goForFirstTestFlightBuild: false,
      error: error instanceof Error ? error.message : "Unexpected iOS preflight failure.",
    }),
  );
  process.exit(4);
}

function check(name, ok) {
  return { name, status: ok ? "PASS" : "BLOCKER", ok: Boolean(ok) };
}

function textLengthBetween(value, minimum, maximum) {
  return typeof value === "string" && Array.from(value).length >= minimum && Array.from(value).length <= maximum;
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== "string")) return false;
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

async function checkPublicUrl(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { Range: "bytes=0-1024", "User-Agent": "Logivya-iOS-release-preflight" },
    });
    return { url, ok: response.ok };
  } catch {
    return { url, ok: false };
  }
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

function resolveReleaseDocsRoot() {
  const canonicalRoot = path.join(repoRoot, "packages", "docs", "production-release", "apple");
  if (existsSync(canonicalRoot)) return canonicalRoot;
  return path.join(repoRoot, "docs", "production-release", "apple");
}
