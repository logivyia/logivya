import process from "node:process";
import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

try {
  const configuration = loadAppleConfiguration();
  const [buildsResult, groupsResult] = await Promise.all([
    appStoreConnectRequest(configuration, "/v1/builds", {
      "filter[app]": configuration.appStoreAppId,
      include: "preReleaseVersion",
      limit: 100,
      sort: "-uploadedDate",
    }),
    appStoreConnectRequest(configuration, "/v1/betaGroups", {
      "filter[app]": configuration.appStoreAppId,
      limit: 100,
    }),
  ]);

  const preReleaseVersions = new Map(
    (buildsResult.payload?.included || [])
      .filter((item) => item.type === "preReleaseVersions")
      .map((item) => [item.id, item.attributes || {}]),
  );
  const builds = (buildsResult.payload?.data || []).map(({ id, attributes = {}, relationships = {} }) => {
    const preReleaseId = relationships.preReleaseVersion?.data?.id;
    const preRelease = preReleaseVersions.get(preReleaseId) || {};
    return {
      id,
      buildNumber: attributes.version || null,
      marketingVersion: preRelease.version || null,
      platform: preRelease.platform || null,
      processingState: attributes.processingState || null,
      expired: Boolean(attributes.expired),
      uploadedDate: attributes.uploadedDate || null,
    };
  });
  const groups = (groupsResult.payload?.data || []).map(({ id, attributes = {} }) => ({
    id,
    name: attributes.name || null,
    internal: Boolean(attributes.isInternalGroup),
    publicLinkEnabled: Boolean(attributes.publicLinkEnabled),
  }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        appStoreAppId: configuration.appStoreAppId,
        bundleIdentifier: configuration.bundleId,
        buildCount: builds.length,
        builds,
        betaGroups: groups,
        externalDistributionNotModified: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof AppleConfigurationError) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exit(2);
  }
  if (error instanceof AppStoreConnectError) {
    console.error(JSON.stringify({ ok: false, httpStatus: error.status, errorCodes: error.codes }));
    process.exit(3);
  }
  console.error(JSON.stringify({ ok: false, error: "Unexpected TestFlight status failure." }));
  process.exit(4);
}
