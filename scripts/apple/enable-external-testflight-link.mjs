import process from "node:process";

import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const groupName = "Logivya External Beta";
const testerLimit = readTesterLimit();

function readTesterLimit() {
  const configured = process.env.TESTFLIGHT_PUBLIC_LINK_LIMIT?.trim() || "100";
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    throw new AppleConfigurationError(
      "TESTFLIGHT_PUBLIC_LINK_LIMIT must be an integer between 1 and 10000.",
    );
  }
  return parsed;
}

try {
  const configuration = loadAppleConfiguration();
  const [builds, groups] = await Promise.all([
    appStoreConnectRequest(configuration, "/v1/builds", {
      "filter[app]": configuration.appStoreAppId,
      limit: 100,
      sort: "-uploadedDate",
    }),
    appStoreConnectRequest(configuration, "/v1/betaGroups", {
      "filter[app]": configuration.appStoreAppId,
      limit: 100,
    }),
  ]);
  const requestedBuild = process.env.IOS_BUILD_NUMBER?.trim();
  const candidates = (builds.payload?.data ?? [])
    .filter((item) => item.attributes?.processingState === "VALID")
    .sort((left, right) => Number(right.attributes?.version ?? 0) - Number(left.attributes?.version ?? 0));
  const build = requestedBuild
    ? candidates.find((item) => item.attributes?.version === requestedBuild)
    : candidates[0];
  const group = (groups.payload?.data ?? []).find(
    (item) => item.attributes?.name === groupName && !item.attributes?.isInternalGroup,
  );
  if (!build) {
    throw new Error(requestedBuild
      ? `Valid TestFlight build ${requestedBuild} was not found.`
      : "No valid TestFlight build was found.");
  }
  if (!group) throw new Error(`External group ${groupName} was not found.`);

  const betaDetail = await appStoreConnectRequest(configuration, `/v1/builds/${build.id}/buildBetaDetail`);
  const externalBuildState = betaDetail.payload?.data?.attributes?.externalBuildState ?? "UNKNOWN";
  if (externalBuildState !== "BETA_APPROVED" && externalBuildState !== "IN_BETA_TESTING") {
    console.log(JSON.stringify({
      ok: false,
      waitingForApple: true,
      externalBuildState,
      group: { id: group.id, name: groupName },
      requestedTesterLimit: testerLimit,
      publicLinkEnabled: false,
    }, null, 2));
    process.exit(2);
  }

  await appStoreConnectRequest(configuration, `/v1/betaGroups/${group.id}`, {}, {
    method: "PATCH",
    body: {
      data: {
        type: "betaGroups",
        id: group.id,
        attributes: {
          publicLinkEnabled: true,
          publicLinkLimitEnabled: true,
          publicLinkLimit: testerLimit,
          feedbackEnabled: true,
        },
      },
    },
  });
  const updated = await appStoreConnectRequest(configuration, `/v1/betaGroups/${group.id}`);
  const attributes = updated.payload?.data?.attributes ?? {};
  if (!attributes.publicLinkEnabled || !attributes.publicLink) {
    throw new Error("Apple did not return an enabled external TestFlight public link.");
  }

  console.log(JSON.stringify({
    ok: true,
    externalBuildState,
    group: { id: group.id, name: groupName },
    publicLinkEnabled: true,
    publicLinkLimit: attributes.publicLinkLimit ?? testerLimit,
    publicLink: attributes.publicLink,
  }, null, 2));
} catch (error) {
  if (error instanceof AppleConfigurationError) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exit(2);
  }
  if (error instanceof AppStoreConnectError) {
    console.error(JSON.stringify({ ok: false, httpStatus: error.status, errorCodes: error.codes }));
    process.exit(3);
  }
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unexpected failure." }));
  process.exit(4);
}
