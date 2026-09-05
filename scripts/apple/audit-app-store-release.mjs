import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const configuration = loadAppleConfiguration();
const easConfiguration = JSON.parse(
  readFileSync(path.join(repoRoot, "apps", "mobile", "eas.json"), "utf8").replace(/^\uFEFF/u, ""),
);
const iosProductionEnvironment = {
  ...(easConfiguration.build?.production?.env || {}),
  ...(easConfiguration.build?.["ios-production"]?.env || {}),
};
const targetVersionString =
  process.env.IOS_MARKETING_VERSION?.trim()
  || process.env.APP_STORE_VERSION?.trim()
  || String(iosProductionEnvironment.EXPO_PUBLIC_APP_VERSION || "").trim();

if (!targetVersionString) {
  console.error(JSON.stringify({ ok: false, reason: "APP_STORE_VERSION_NOT_CONFIGURED" }, null, 2));
  process.exit(1);
}

async function optionalRead(pathname, searchParams = {}) {
  try {
    const response = await appStoreConnectRequest(configuration, pathname, searchParams);
    return { accessible: true, status: response.status, data: response.payload?.data ?? null };
  } catch (error) {
    if (error instanceof AppStoreConnectError) {
      return {
        accessible: false,
        status: error.status,
        codes: error.codes,
      };
    }
    throw error;
  }
}

function compactAttributes(resource) {
  if (!resource) return null;
  return {
    id: resource.id,
    type: resource.type,
    attributes: resource.attributes ?? {},
  };
}

const versions = await optionalRead(`/v1/apps/${configuration.appStoreAppId}/appStoreVersions`, {
  "filter[platform]": "IOS",
  "filter[versionString]": targetVersionString,
  limit: 50,
});
const version = Array.isArray(versions.data)
  ? versions.data.find((entry) => entry.attributes?.versionString === targetVersionString)
  : null;

if (!version) {
  console.error(
    JSON.stringify(
      { ok: false, reason: "APP_STORE_VERSION_NOT_FOUND", targetVersion: targetVersionString },
      null,
      2,
    ),
  );
  process.exit(1);
}

const versionId = version.id;
const [build, localizations, reviewDetail, versionSubmission, appInfos] = await Promise.all([
  optionalRead(`/v1/appStoreVersions/${versionId}/build`),
  optionalRead(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`, { limit: 50 }),
  optionalRead(`/v1/appStoreVersions/${versionId}/appStoreReviewDetail`),
  optionalRead(`/v1/appStoreVersions/${versionId}/appStoreVersionSubmission`),
  optionalRead(`/v1/apps/${configuration.appStoreAppId}/appInfos`, { limit: 50 }),
]);

function compactReviewDetail(resource) {
  const compact = compactAttributes(resource);
  if (!compact?.attributes) return compact;
  return {
    ...compact,
    attributes: {
      ...compact.attributes,
      demoAccountPassword: compact.attributes.demoAccountPassword ? "[REDACTED]" : null,
    },
  };
}

const localizationDetails = [];
for (const localization of Array.isArray(localizations.data) ? localizations.data : []) {
  const screenshotSets = await optionalRead(
    `/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets`,
    { limit: 50 },
  );
  const sets = [];
  for (const set of Array.isArray(screenshotSets.data) ? screenshotSets.data : []) {
    const screenshots = await optionalRead(`/v1/appScreenshotSets/${set.id}/appScreenshots`, {
      limit: 50,
    });
    sets.push({
      id: set.id,
      displayType: set.attributes?.screenshotDisplayType ?? null,
      screenshotCount: Array.isArray(screenshots.data) ? screenshots.data.length : null,
      accessible: screenshots.accessible,
    });
  }
  localizationDetails.push({
    ...compactAttributes(localization),
    screenshotSets: sets,
  });
}

const appInfoDetails = [];
for (const appInfo of Array.isArray(appInfos.data) ? appInfos.data : []) {
  const [infoLocalizations, ageRating] = await Promise.all([
    optionalRead(`/v1/appInfos/${appInfo.id}/appInfoLocalizations`, { limit: 50 }),
    optionalRead(`/v1/appInfos/${appInfo.id}/ageRatingDeclaration`),
  ]);
  appInfoDetails.push({
    ...compactAttributes(appInfo),
    localizations: Array.isArray(infoLocalizations.data)
      ? infoLocalizations.data.map(compactAttributes)
      : infoLocalizations,
    ageRating: ageRating.accessible ? compactAttributes(ageRating.data) : ageRating,
  });
}

const ageRatingDeclarations = appInfoDetails
  .map((appInfo) => appInfo.ageRating)
  .filter((ageRating) => ageRating?.type === "ageRatingDeclarations");
const ageRatingValid = ageRatingDeclarations.length > 0
  && ageRatingDeclarations.every(
    (ageRating) => ageRating.attributes?.messagingAndChat === true,
  );
const auditOk = ageRatingValid;

console.log(
  JSON.stringify(
    {
      ok: auditOk,
      appStoreAppId: configuration.appStoreAppId,
      targetVersion: targetVersionString,
      version: compactAttributes(version),
      build: build.accessible ? compactAttributes(build.data) : build,
      versionSubmission: versionSubmission.accessible
        ? compactAttributes(versionSubmission.data)
        : versionSubmission,
      reviewDetail: reviewDetail.accessible ? compactReviewDetail(reviewDetail.data) : reviewDetail,
      localizations: localizationDetails,
      appInfos: appInfoDetails,
      requiredChecks: {
        messagingAndChat: {
          ok: ageRatingValid,
          expected: true,
          declarationsChecked: ageRatingDeclarations.length,
        },
      },
    },
    null,
    2,
  ),
);
if (!auditOk) process.exitCode = 1;
