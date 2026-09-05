import process from "node:process";
import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

function summarizeVersions(payload) {
  return (payload?.data || []).map(({ id, attributes = {} }) => ({
    id,
    versionString: attributes.versionString || null,
    platform: attributes.platform || null,
    appStoreState: attributes.appStoreState || null,
    releaseType: attributes.releaseType || null,
  }));
}

function summarizeBuilds(payload) {
  const preReleaseVersions = new Map(
    (payload?.included || [])
      .filter((item) => item.type === "preReleaseVersions")
      .map((item) => [item.id, item.attributes || {}]),
  );
  return (payload?.data || []).map(({ id, attributes = {}, relationships = {} }) => {
    const preReleaseId = relationships.preReleaseVersion?.data?.id;
    return {
      id,
      buildNumber: attributes.version || null,
      marketingVersion: preReleaseVersions.get(preReleaseId)?.version || null,
      platform: preReleaseVersions.get(preReleaseId)?.platform || null,
      processingState: attributes.processingState || null,
      expired: Boolean(attributes.expired),
      uploadedDate: attributes.uploadedDate || null,
    };
  });
}

async function optionalRead(configuration, pathname, searchParams) {
  try {
    const result = await appStoreConnectRequest(configuration, pathname, searchParams);
    return { accessible: true, status: result.status, payload: result.payload };
  } catch (error) {
    if (error instanceof AppStoreConnectError) {
      return { accessible: false, status: error.status, errorCodes: error.codes };
    }
    throw error;
  }
}

try {
  const configuration = loadAppleConfiguration();
  const appsResult = await appStoreConnectRequest(configuration, `/v1/apps/${configuration.appStoreAppId}`);
  const bundleIdsResult = await optionalRead(configuration, "/v1/bundleIds", {
    "filter[identifier]": configuration.bundleId,
    limit: 10,
  });
  const app = appsResult.payload?.data || null;
  const bundleIdRecord = bundleIdsResult.accessible
    ? (bundleIdsResult.payload?.data || []).find(
        (candidate) => candidate.attributes?.identifier === configuration.bundleId,
      ) || null
    : null;

  const report = {
    authentication: {
      success: true,
      httpStatus: appsResult.status,
      permission: "App records read access confirmed; the exact API-key role is not exposed by this endpoint.",
    },
    appRecord: {
      exists: Boolean(app),
      expectedBundleId: configuration.bundleId,
    },
    bundleIdRecord: bundleIdsResult.accessible
      ? {
          accessible: true,
          exists: Boolean(bundleIdRecord),
          id: bundleIdRecord?.id || null,
          name: bundleIdRecord?.attributes?.name || null,
          platform: bundleIdRecord?.attributes?.platform || null,
        }
      : bundleIdsResult,
  };

  if (app) {
    const appId = app.id;
    const versions = await optionalRead(configuration, `/v1/apps/${appId}/appStoreVersions`, { limit: 50 });
    const builds = await optionalRead(configuration, "/v1/builds", {
      "filter[app]": appId,
      include: "preReleaseVersion",
      limit: 50,
    });
    const appInfos = await optionalRead(configuration, `/v1/apps/${appId}/appInfos`, { limit: 10 });

    report.appRecord = {
      exists: true,
      id: appId,
      name: app.attributes?.name || null,
      bundleId: app.attributes?.bundleId || null,
      sku: app.attributes?.sku || null,
      primaryLocale: app.attributes?.primaryLocale || null,
      expectedAppIdMatches: appId === configuration.appStoreAppId,
      expectedNameMatches: String(app.attributes?.name || "").toLocaleLowerCase("en-US") === "logivya",
      expectedBundleIdMatches: app.attributes?.bundleId === configuration.bundleId,
      expectedPrimaryLocaleMatches: app.attributes?.primaryLocale === "en-US",
    };
    report.versions = versions.accessible ? summarizeVersions(versions.payload) : versions;
    report.builds = builds.accessible ? summarizeBuilds(builds.payload) : builds;
    report.testFlight = {
      accessible: builds.accessible,
      buildCount: builds.accessible ? report.builds.length : null,
      processingBuildCount: builds.accessible
        ? report.builds.filter((build) => build.processingState && build.processingState !== "VALID").length
        : null,
    };
    report.appInfo = appInfos.accessible
      ? { accessible: true, status: appInfos.status, recordCount: appInfos.payload?.data?.length || 0 }
      : appInfos;
    report.appPrivacy = {
      accessible: false,
      verification: "MANUAL_REQUIRED",
      reason: "App Privacy questionnaire completion is not proven by the read-only app endpoints.",
    };
    report.accountConditions = {
      agreements: "Not exposed by the read-only app endpoints; verify in App Store Connect Agreements, Tax, and Banking.",
    };

  }
  const expectedVersion = report.versions?.find(
    (version) => version.versionString === "1.0" && version.platform === "IOS",
  );
  report.identityVerified = Boolean(
    report.appRecord?.exists &&
      report.appRecord.expectedAppIdMatches &&
      report.appRecord.expectedNameMatches &&
      report.appRecord.expectedBundleIdMatches &&
      report.appRecord.expectedPrimaryLocaleMatches &&
      expectedVersion,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.identityVerified) process.exitCode = 5;
} catch (error) {
  if (error instanceof AppleConfigurationError) {
    console.error(JSON.stringify({ authentication: { success: false, httpStatus: null }, error: error.message }));
    process.exit(2);
  }
  if (error instanceof AppStoreConnectError) {
    console.error(
      JSON.stringify({
        authentication: { success: false, httpStatus: error.status },
        errorCodes: error.codes,
      }),
    );
    process.exit(3);
  }
  console.error(JSON.stringify({ authentication: { success: false, httpStatus: null }, error: "Unexpected validation failure." }));
  process.exit(4);
}
