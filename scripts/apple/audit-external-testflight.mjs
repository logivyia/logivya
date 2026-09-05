import process from "node:process";

import {
  AppleConfigurationError,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

async function safeRequest(configuration, pathname, searchParams = {}) {
  try {
    const response = await appStoreConnectRequest(configuration, pathname, searchParams);
    return { ok: true, status: response.status, data: response.payload?.data ?? null };
  } catch (error) {
    if (error instanceof AppStoreConnectError) {
      return { ok: false, status: error.status, codes: error.codes };
    }
    throw error;
  }
}

try {
  const configuration = loadAppleConfiguration();
  const builds = await appStoreConnectRequest(configuration, "/v1/builds", {
    "filter[app]": configuration.appStoreAppId,
    limit: 100,
    sort: "-uploadedDate",
  });
  const requestedBuild = process.env.IOS_BUILD_NUMBER?.trim();
  const candidates = (builds.payload?.data ?? [])
    .filter((build) => build.attributes?.processingState === "VALID")
    .sort((left, right) => Number(right.attributes?.version ?? 0) - Number(left.attributes?.version ?? 0));
  const candidate = requestedBuild
    ? candidates.find((build) => build.attributes?.version === requestedBuild)
    : candidates[0];
  if (!candidate) {
    throw new Error(requestedBuild
      ? `Valid TestFlight build ${requestedBuild} was not found.`
      : "No valid TestFlight build was found.");
  }

  const [groups, appLocalizations, reviewDetail, buildLocalizations, buildDetail, submissions] = await Promise.all([
    safeRequest(configuration, "/v1/betaGroups", {
      "filter[app]": configuration.appStoreAppId,
      limit: 100,
    }),
    safeRequest(configuration, `/v1/apps/${configuration.appStoreAppId}/betaAppLocalizations`, { limit: 100 }),
    safeRequest(configuration, `/v1/apps/${configuration.appStoreAppId}/betaAppReviewDetail`),
    safeRequest(configuration, `/v1/builds/${candidate.id}/betaBuildLocalizations`, { limit: 100 }),
    safeRequest(configuration, `/v1/builds/${candidate.id}/buildBetaDetail`),
    safeRequest(configuration, "/v1/betaAppReviewSubmissions", {
      "filter[build]": candidate.id,
      limit: 20,
    }),
  ]);

  console.log(JSON.stringify({
    ok: true,
    appStoreAppId: configuration.appStoreAppId,
    build: {
      id: candidate.id,
      number: candidate.attributes?.version,
      processingState: candidate.attributes?.processingState,
    },
    externalGroups: groups.ok
      ? (groups.data ?? []).filter((group) => !group.attributes?.isInternalGroup).map((group) => ({
          id: group.id,
          name: group.attributes?.name,
          publicLinkEnabled: Boolean(group.attributes?.publicLinkEnabled),
          publicLink: group.attributes?.publicLink ?? null,
          publicLinkLimit: group.attributes?.publicLinkLimit ?? null,
        }))
      : groups,
    betaAppLocalizations: appLocalizations,
    betaAppReviewDetail: reviewDetail.ok
      ? {
          ok: true,
          status: reviewDetail.status,
          data: {
            id: reviewDetail.data?.id ?? null,
            contactFirstNamePresent: Boolean(reviewDetail.data?.attributes?.contactFirstName),
            contactLastNamePresent: Boolean(reviewDetail.data?.attributes?.contactLastName),
            contactPhonePresent: Boolean(reviewDetail.data?.attributes?.contactPhone),
            contactEmailPresent: Boolean(reviewDetail.data?.attributes?.contactEmail),
            demoAccountRequired: reviewDetail.data?.attributes?.demoAccountRequired ?? null,
            demoAccountNamePresent: Boolean(reviewDetail.data?.attributes?.demoAccountName),
            demoAccountPasswordPresent: Boolean(reviewDetail.data?.attributes?.demoAccountPassword),
            notesPresent: Boolean(reviewDetail.data?.attributes?.notes),
          },
        }
      : reviewDetail,
    betaBuildLocalizations: buildLocalizations,
    buildBetaDetail: buildDetail,
    reviewSubmissions: submissions,
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
