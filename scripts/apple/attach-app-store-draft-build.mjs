import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  EXPECTED_APP_STORE_APP_ID,
  EXPECTED_BUNDLE_ID,
  EXPECTED_TEAM_ID,
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

export const TARGET_VERSION = "1.0.11";
export const TARGET_BUILD = "185";
export const APPLY_APPROVAL_VARIABLE = "APPLE_DRAFT_BUILD_ATTACH_APPROVED";

function one(resources, predicate, description) {
  const matches = resources.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${description} must resolve to exactly one record; found ${matches.length}.`);
  }
  return matches[0];
}

function assertConfirmedTarget(configuration, confirmations) {
  if (
    confirmations.appId !== EXPECTED_APP_STORE_APP_ID
    || confirmations.bundleId !== EXPECTED_BUNDLE_ID
    || confirmations.teamId !== EXPECTED_TEAM_ID
  ) {
    throw new Error(
      `Confirm the target with --app-id ${EXPECTED_APP_STORE_APP_ID} --bundle-id ${EXPECTED_BUNDLE_ID} --team-id ${EXPECTED_TEAM_ID}.`,
    );
  }
  if (
    configuration.appStoreAppId !== EXPECTED_APP_STORE_APP_ID
    || configuration.bundleId !== EXPECTED_BUNDLE_ID
    || configuration.teamId !== EXPECTED_TEAM_ID
  ) {
    throw new Error("Loaded Apple configuration does not identify the approved Logivya target.");
  }
}

async function readOptionalVersionSubmission(request, configuration, versionId) {
  try {
    return await request(
      configuration,
      `/v1/appStoreVersions/${versionId}/appStoreVersionSubmission`,
    );
  } catch (error) {
    if (
      error instanceof AppStoreConnectError
      && error.status === 404
      && error.codes.includes("NOT_FOUND")
    ) {
      return { status: 404, payload: { data: null } };
    }
    throw error;
  }
}

async function readDraftSnapshot(request, configuration) {
  const [appResponse, versionsResponse, buildsResponse] = await Promise.all([
    request(configuration, `/v1/apps/${configuration.appStoreAppId}`),
    request(configuration, `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`, {
      "filter[platform]": "IOS",
      "filter[versionString]": TARGET_VERSION,
      limit: 10,
    }),
    request(configuration, "/v1/builds", {
      "filter[app]": configuration.appStoreAppId,
      "filter[version]": TARGET_BUILD,
      include: "preReleaseVersion",
      limit: 10,
    }),
  ]);

  const app = appResponse.payload?.data;
  if (app?.id !== configuration.appStoreAppId || app?.attributes?.bundleId !== configuration.bundleId) {
    throw new Error("App Store app identity or bundle identifier does not match the approved target.");
  }

  const version = one(
    versionsResponse.payload?.data ?? [],
    (item) =>
      item.attributes?.platform === "IOS"
      && item.attributes?.versionString === TARGET_VERSION,
    `iOS App Store version ${TARGET_VERSION}`,
  );
  if (version.attributes?.appStoreState !== "PREPARE_FOR_SUBMISSION") {
    throw new Error(`Version ${TARGET_VERSION} is not in PREPARE_FOR_SUBMISSION.`);
  }
  if (version.attributes?.releaseType !== "AFTER_APPROVAL") {
    throw new Error(`Version ${TARGET_VERSION} releaseType is not AFTER_APPROVAL.`);
  }

  const build = one(
    buildsResponse.payload?.data ?? [],
    (item) => item.attributes?.version === TARGET_BUILD,
    `iOS build ${TARGET_BUILD}`,
  );
  if (build.attributes?.processingState !== "VALID" || build.attributes?.expired === true) {
    throw new Error(`Build ${TARGET_BUILD} must be VALID and non-expired.`);
  }
  const preReleaseVersionId = build.relationships?.preReleaseVersion?.data?.id;
  const preReleaseVersion = (buildsResponse.payload?.included ?? []).find(
    (item) => item.type === "preReleaseVersions" && item.id === preReleaseVersionId,
  );
  if (
    !preReleaseVersion
    || preReleaseVersion.attributes?.version !== TARGET_VERSION
    || preReleaseVersion.attributes?.platform !== "IOS"
  ) {
    throw new Error(`Build ${TARGET_BUILD} does not belong to iOS marketing version ${TARGET_VERSION}.`);
  }

  const [linkedBuildResponse, submissionResponse] = await Promise.all([
    request(configuration, `/v1/appStoreVersions/${version.id}/build`),
    readOptionalVersionSubmission(request, configuration, version.id),
  ]);
  if (submissionResponse.payload?.data) {
    throw new Error(`Version ${TARGET_VERSION} already has an App Store version submission.`);
  }

  return {
    app,
    version,
    build,
    linkedBuild: linkedBuildResponse.payload?.data ?? null,
  };
}

async function auditAttachedDraft(request, configuration, versionId, buildId) {
  const [versionResponse, linkedBuildResponse, submissionResponse] = await Promise.all([
    request(configuration, `/v1/appStoreVersions/${versionId}`),
    request(configuration, `/v1/appStoreVersions/${versionId}/build`),
    readOptionalVersionSubmission(request, configuration, versionId),
  ]);
  const version = versionResponse.payload?.data;
  const linkedBuild = linkedBuildResponse.payload?.data;
  const checks = {
    version: version?.attributes?.versionString === TARGET_VERSION,
    state: version?.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION",
    releaseType: version?.attributes?.releaseType === "AFTER_APPROVAL",
    buildId: linkedBuild?.id === buildId,
    buildNumber: linkedBuild?.attributes?.version === TARGET_BUILD,
    buildValid: linkedBuild?.attributes?.processingState === "VALID",
    buildNotExpired: linkedBuild?.attributes?.expired !== true,
    noVersionSubmission: !submissionResponse.payload?.data,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(`Post-attach audit failed: ${failed.join(", ")}.`);
  }
  return checks;
}

export async function attachAppStoreDraftBuild({
  request = appStoreConnectRequest,
  configuration,
  confirmations,
  apply = false,
  approval = "",
} = {}) {
  if (!configuration) throw new Error("Apple configuration is required.");
  assertConfirmedTarget(configuration, confirmations ?? {});
  if (apply && approval !== "YES") {
    throw new Error(`Apply blocked: set ${APPLY_APPROVAL_VARIABLE}=YES for this command only.`);
  }

  const before = await readDraftSnapshot(request, configuration);
  const alreadyAttached = before.linkedBuild?.id === before.build.id
    && before.linkedBuild?.attributes?.version === TARGET_BUILD;
  if (!apply) {
    return {
      ok: true,
      mode: "DRY_RUN",
      mutationPerformed: false,
      target: targetSummary(configuration),
      before: {
        state: before.version.attributes.appStoreState,
        releaseType: before.version.attributes.releaseType,
        linkedBuildNumber: before.linkedBuild?.attributes?.version ?? null,
        candidateBuildState: before.build.attributes.processingState,
        candidateBuildExpired: before.build.attributes.expired === true,
        noVersionSubmission: true,
      },
      wouldAttach: !alreadyAttached,
    };
  }

  if (!alreadyAttached) {
    await request(
      configuration,
      `/v1/appStoreVersions/${before.version.id}/relationships/build`,
      {},
      {
        method: "PATCH",
        body: { data: { type: "builds", id: before.build.id } },
      },
    );
  }
  const audit = await auditAttachedDraft(
    request,
    configuration,
    before.version.id,
    before.build.id,
  );
  return {
    ok: true,
    mode: "APPLY",
    mutationPerformed: !alreadyAttached,
    target: targetSummary(configuration),
    audit,
  };
}

function targetSummary(configuration) {
  return {
    appStoreAppId: configuration.appStoreAppId,
    bundleIdentifier: configuration.bundleId,
    appleTeamId: configuration.teamId,
    marketingVersion: TARGET_VERSION,
    buildNumber: TARGET_BUILD,
  };
}

function readArgument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export async function runCli(args = process.argv.slice(2), environment = process.env) {
  const result = await attachAppStoreDraftBuild({
    configuration: loadAppleConfiguration(),
    confirmations: {
      appId: readArgument(args, "--app-id"),
      bundleId: readArgument(args, "--bundle-id"),
      teamId: readArgument(args, "--team-id"),
    },
    apply: args.includes("--apply"),
    approval: environment[APPLY_APPROVAL_VARIABLE]?.trim() ?? "",
  });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runCli().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unexpected failure." }));
    process.exitCode = 1;
  });
}
