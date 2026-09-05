import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const VERSION_STRING = process.env.IOS_MARKETING_VERSION?.trim() || "1.0.1";
const BUILD_NUMBER = process.env.IOS_BUILD_NUMBER?.trim() || readConfiguredBuildNumber();
const PUBLIC_LOCALES = [
  { source: "en-US", appStore: "en-US" },
  { source: "tr-TR", appStore: "tr" },
];

function write(configuration, pathname, method, body) {
  return appStoreConnectRequest(configuration, pathname, {}, { method, body });
}

function one(resources, predicate, description) {
  const match = resources.find(predicate);
  if (!match) throw new Error(`${description} was not found.`);
  return match;
}

async function assertPublicUrl(url, rejectedPathnames = []) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Logivya-App-Store-Release/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Required public URL returned HTTP ${response.status}: ${url}`);
  }
  const finalUrl = new URL(response.url);
  if (rejectedPathnames.includes(finalUrl.pathname)) {
    throw new Error(`Required public URL redirects to a restricted page: ${url}`);
  }
  return url;
}

try {
  const configuration = loadAppleConfiguration();
  const metadataPath = path.join(
    resolveReleaseDocsRoot(),
    "app-store-metadata.json",
  );
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  for (const { source: locale } of PUBLIC_LOCALES) {
    const localized = metadata.localizations?.[locale];
    if (!localized?.description || !localized?.keywords || !localized?.promotionalText || !localized?.subtitle || !localized?.reviewNotes) {
      throw new Error(`Complete ${locale} App Store metadata is required.`);
    }
  }

  const publicUrls = {
    marketing: await assertPublicUrl(metadata.urls.marketing),
    support: await assertPublicUrl(metadata.urls.support, ["/login"]),
    privacyPolicy: await assertPublicUrl(metadata.urls.privacyPolicy),
  };

  const [versionsResponse, buildsResponse, appInfosResponse] = await Promise.all([
    appStoreConnectRequest(
      configuration,
      `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
      { "filter[platform]": "IOS", limit: 50 },
    ),
    appStoreConnectRequest(configuration, "/v1/builds", {
      "filter[app]": configuration.appStoreAppId,
      "filter[version]": BUILD_NUMBER,
      limit: 10,
    }),
    appStoreConnectRequest(configuration, `/v1/apps/${configuration.appStoreAppId}/appInfos`, {
      limit: 50,
    }),
  ]);

  const version = one(
    versionsResponse.payload?.data ?? [],
    (item) => item.attributes?.versionString === VERSION_STRING,
    `iOS App Store version ${VERSION_STRING}`,
  );
  const editableVersionStates = new Set([
    "PREPARE_FOR_SUBMISSION",
    "DEVELOPER_REJECTED",
    "REJECTED",
  ]);
  if (!editableVersionStates.has(version.attributes?.appStoreState)) {
    throw new Error(
      `Version ${VERSION_STRING} is not editable (${version.attributes?.appStoreState || "UNKNOWN"}).`,
    );
  }

  const build = one(
    buildsResponse.payload?.data ?? [],
    (item) =>
      item.attributes?.version === BUILD_NUMBER &&
      item.attributes?.processingState === "VALID" &&
      item.attributes?.expired !== true,
    `valid iOS build ${BUILD_NUMBER}`,
  );
  const appInfo = one(
    appInfosResponse.payload?.data ?? [],
    (item) => editableVersionStates.has(item.attributes?.appStoreState),
    "editable App Store app information",
  );

  const [versionLocalizationsResponse, appInfoLocalizationsResponse, reviewDetailResponse, ageRatingResponse] = await Promise.all([
    appStoreConnectRequest(
      configuration,
      `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`,
      { limit: 50 },
    ),
    appStoreConnectRequest(configuration, `/v1/appInfos/${appInfo.id}/appInfoLocalizations`, {
      limit: 50,
    }),
    appStoreConnectRequest(
      configuration,
      `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,
    ),
    appStoreConnectRequest(
      configuration,
      `/v1/appInfos/${appInfo.id}/ageRatingDeclaration`,
    ),
  ]);
  const reviewDetail = reviewDetailResponse.payload?.data;
  if (!reviewDetail?.id) {
    throw new Error(`App Store review details for version ${VERSION_STRING} were not found.`);
  }
  const ageRatingDeclaration = ageRatingResponse.payload?.data;
  if (!ageRatingDeclaration?.id) {
    throw new Error("App Store age rating declaration was not found.");
  }
  await write(configuration, `/v1/appStoreVersions/${version.id}`, "PATCH", {
    data: {
      type: "appStoreVersions",
      id: version.id,
      attributes: {
        copyright: metadata.copyright,
        releaseType: "AFTER_APPROVAL",
        usesIdfa: false,
      },
    },
  });
  await write(configuration, `/v1/appStoreVersions/${version.id}/relationships/build`, "PATCH", {
    data: { type: "builds", id: build.id },
  });
  const storedLocalizations = [];
  for (const { source, appStore: locale } of PUBLIC_LOCALES) {
    const localized = metadata.localizations[source];
    const versionLocalization = await upsertVersionLocalization({
      configuration,
      locale,
      localized,
      publicUrls,
      version,
      existing: (versionLocalizationsResponse.payload?.data ?? []).find(
        (item) => item.attributes?.locale === locale,
      ),
    });
    const appInfoLocalization = await upsertAppInfoLocalization({
      appInfo,
      configuration,
      locale,
      localized,
      publicUrls,
      existing: (appInfoLocalizationsResponse.payload?.data ?? []).find(
        (item) => item.attributes?.locale === locale,
      ),
    });
    storedLocalizations.push({ sourceLocale: source, appStoreLocale: locale, versionLocalization, appInfoLocalization });
  }

  const reviewNotes = metadata.localizations[metadata.primaryLocale]?.reviewNotes;
  const storedReviewDetail = await write(
    configuration,
    `/v1/appStoreReviewDetails/${reviewDetail.id}`,
    "PATCH",
    {
      data: {
        type: "appStoreReviewDetails",
        id: reviewDetail.id,
        attributes: { notes: reviewNotes },
      },
    },
  );
  const storedAgeRating = await write(
    configuration,
    `/v1/ageRatingDeclarations/${ageRatingDeclaration.id}`,
    "PATCH",
    {
      data: {
        type: "ageRatingDeclarations",
        id: ageRatingDeclaration.id,
        attributes: { messagingAndChat: true },
      },
    },
  );
  if (storedAgeRating.payload?.data?.attributes?.messagingAndChat !== true) {
    throw new Error("App Store Messaging and Chat age rating could not be enabled.");
  }

  const [attachedBuild, updatedVersion] = await Promise.all([
      appStoreConnectRequest(configuration, `/v1/appStoreVersions/${version.id}/build`),
      appStoreConnectRequest(configuration, `/v1/appStoreVersions/${version.id}`),
    ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        version: {
          id: version.id,
          versionString: updatedVersion.payload?.data?.attributes?.versionString,
          state: updatedVersion.payload?.data?.attributes?.appStoreState,
          copyright: updatedVersion.payload?.data?.attributes?.copyright,
          usesIdfa: updatedVersion.payload?.data?.attributes?.usesIdfa,
          releaseType: updatedVersion.payload?.data?.attributes?.releaseType,
        },
        build: {
          id: attachedBuild.payload?.data?.id,
          number: attachedBuild.payload?.data?.attributes?.version,
          processingState: attachedBuild.payload?.data?.attributes?.processingState,
        },
        localizations: storedLocalizations,
        reviewDetail: {
          id: storedReviewDetail.payload?.data?.id,
          notesStored: storedReviewDetail.payload?.data?.attributes?.notes === reviewNotes,
          notesLength: storedReviewDetail.payload?.data?.attributes?.notes?.length ?? 0,
        },
        ageRating: {
          id: storedAgeRating.payload?.data?.id,
          messagingAndChat: storedAgeRating.payload?.data?.attributes?.messagingAndChat === true,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof AppStoreConnectError) {
    console.error(
      JSON.stringify({
        ok: false,
        httpStatus: error.status,
        errorCodes: error.codes,
      }),
    );
    process.exit(2);
  }
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected release preparation failure.",
    }),
  );
  process.exit(1);
}

function resolveReleaseDocsRoot() {
  const canonicalRoot = path.join(repoRoot, "packages", "docs", "production-release", "apple");
  try {
    readFileSync(path.join(canonicalRoot, "app-store-metadata.json"), "utf8");
    return canonicalRoot;
  } catch {
    return path.join(repoRoot, "docs", "production-release", "apple");
  }
}

function readConfiguredBuildNumber() {
  const easJson = JSON.parse(readFileSync(path.join(repoRoot, "apps", "mobile", "eas.json"), "utf8"));
  return easJson.build?.["ios-production"]?.env?.IOS_BUILD_NUMBER || "160";
}

async function upsertVersionLocalization({ configuration, locale, localized, publicUrls, version, existing }) {
  const attributes = {
    description: localized.description,
    keywords: localized.keywords,
    marketingUrl: publicUrls.marketing,
    promotionalText: localized.promotionalText,
    supportUrl: publicUrls.support,
    ...(localized.whatsNew ? { whatsNew: localized.whatsNew } : {}),
  };
  const response = existing
    ? await write(configuration, `/v1/appStoreVersionLocalizations/${existing.id}`, "PATCH", {
        data: { type: "appStoreVersionLocalizations", id: existing.id, attributes },
      })
    : await write(configuration, "/v1/appStoreVersionLocalizations", "POST", {
        data: {
          type: "appStoreVersionLocalizations",
          attributes: { locale, ...attributes },
          relationships: {
            appStoreVersion: { data: { type: "appStoreVersions", id: version.id } },
          },
        },
      });
  return {
    id: response.payload?.data?.id,
    locale: response.payload?.data?.attributes?.locale,
    descriptionStored: Boolean(response.payload?.data?.attributes?.description),
    keywordsStored: Boolean(response.payload?.data?.attributes?.keywords),
    promotionalTextStored: Boolean(response.payload?.data?.attributes?.promotionalText),
    whatsNewStored: localized.whatsNew
      ? response.payload?.data?.attributes?.whatsNew === localized.whatsNew
      : true,
  };
}

async function upsertAppInfoLocalization({ appInfo, configuration, locale, localized, publicUrls, existing }) {
  const attributes = {
    privacyPolicyUrl: publicUrls.privacyPolicy,
    subtitle: localized.subtitle,
  };
  const response = existing
    ? await write(configuration, `/v1/appInfoLocalizations/${existing.id}`, "PATCH", {
        data: { type: "appInfoLocalizations", id: existing.id, attributes },
      })
    : await write(configuration, "/v1/appInfoLocalizations", "POST", {
        data: {
          type: "appInfoLocalizations",
          attributes: { locale, ...attributes },
          relationships: {
            appInfo: { data: { type: "appInfos", id: appInfo.id } },
          },
        },
      });
  return {
    id: response.payload?.data?.id,
    locale: response.payload?.data?.attributes?.locale,
    subtitle: response.payload?.data?.attributes?.subtitle,
    privacyPolicyUrl: response.payload?.data?.attributes?.privacyPolicyUrl,
  };
}
