import {
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";
import { appendAppStoreScreenshots } from "./append-app-store-screenshots.mjs";

const VERSION = process.env.APP_STORE_SCREENSHOT_VERSION?.trim() || "1.0";
const EXPECTED_BUILD = process.env.APP_STORE_EXPECTED_BUILD?.trim() || "162";
const EDITABLE_VERSION_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
]);

function assertWithdrawalApproval(submissionId) {
  const approved = process.env.APPLE_REVIEW_WITHDRAWAL_APPROVED === "YES";
  const approvedSubmissionId = process.env.APPLE_REVIEW_WITHDRAWAL_SUBMISSION_ID?.trim();
  if (!approved || approvedSubmissionId !== submissionId) {
    throw new Error(
      `Review withdrawal blocked. Explicitly approve submission ${submissionId} before changing screenshots.`,
    );
  }
}

function dataArray(result) {
  return Array.isArray(result?.payload?.data) ? result.payload.data : [];
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findVersion(configuration) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    {
      "filter[platform]": "IOS",
      "filter[versionString]": VERSION,
      limit: 20,
    },
  );
  const version = dataArray(response)[0];
  if (!version) throw new Error(`App Store version ${VERSION} was not found.`);
  return version;
}

async function getVersion(configuration, versionId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${versionId}`,
    { "fields[appStoreVersions]": "versionString,appStoreState,platform" },
  );
  return response.payload?.data;
}

async function verifyBuild(configuration, versionId) {
  const relationship = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${versionId}/build`,
    { "fields[builds]": "version,processingState" },
  );
  const build = relationship.payload?.data;
  if (!build) throw new Error(`App Store version ${VERSION} has no selected build.`);
  const buildVersion = String(build.attributes?.version || "");
  const processingState = String(build.attributes?.processingState || "");
  if (buildVersion !== EXPECTED_BUILD) {
    throw new Error(`Selected build is ${buildVersion || "unknown"}; expected ${EXPECTED_BUILD}.`);
  }
  if (processingState !== "VALID") {
    throw new Error(`Build ${EXPECTED_BUILD} is ${processingState || "unknown"}, not VALID.`);
  }
  return { id: build.id, version: buildVersion, processingState };
}

async function listReviewSubmissions(configuration) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/reviewSubmissions`,
    { "filter[platform]": "IOS", limit: 200 },
  );
  return dataArray(response);
}

async function submissionContainsVersion(configuration, submissionId, versionId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/reviewSubmissions/${submissionId}/items`,
    { include: "appStoreVersion", limit: 50 },
  );
  const included = Array.isArray(response.payload?.included) ? response.payload.included : [];
  return included.some((item) => item.type === "appStoreVersions" && item.id === versionId);
}

async function findActiveSubmission(configuration, versionId) {
  const submissions = await listReviewSubmissions(configuration);
  const candidates = submissions.filter((submission) =>
    ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(submission.attributes?.state));
  for (const submission of candidates) {
    if (await submissionContainsVersion(configuration, submission.id, versionId)) return submission;
  }
  throw new Error(`No active iOS review submission contains version ${VERSION}.`);
}

async function updateSubmission(configuration, submissionId, attributes) {
  return appStoreConnectRequest(configuration, `/v1/reviewSubmissions/${submissionId}`, {}, {
    method: "PATCH",
    body: {
      data: {
        type: "reviewSubmissions",
        id: submissionId,
        attributes,
      },
    },
  });
}

async function waitForCancellation(configuration, submissionId, versionId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const [submissionResponse, version] = await Promise.all([
      appStoreConnectRequest(configuration, `/v1/reviewSubmissions/${submissionId}`),
      getVersion(configuration, versionId),
    ]);
    const submissionState = submissionResponse.payload?.data?.attributes?.state;
    const versionState = version?.attributes?.appStoreState;
    if (submissionState !== "WAITING_FOR_REVIEW" && EDITABLE_VERSION_STATES.has(versionState)) {
      return { submissionState, versionState };
    }
    await delay(2_000);
  }
  throw new Error("Apple did not unlock the app version after canceling review in time.");
}

async function createReviewSubmission(configuration) {
  const response = await appStoreConnectRequest(configuration, "/v1/reviewSubmissions", {}, {
    method: "POST",
    body: {
      data: {
        type: "reviewSubmissions",
        relationships: {
          app: {
            data: { type: "apps", id: configuration.appStoreAppId },
          },
        },
      },
    },
  });
  const submission = response.payload?.data;
  if (!submission?.id) throw new Error("Apple did not create a new review submission.");
  return submission;
}

async function addVersionToSubmission(configuration, submissionId, versionId) {
  await appStoreConnectRequest(configuration, "/v1/reviewSubmissionItems", {}, {
    method: "POST",
    body: {
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: {
            data: { type: "reviewSubmissions", id: submissionId },
          },
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    },
  });
}

async function waitForReviewState(configuration, submissionId, expectedState) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await appStoreConnectRequest(
      configuration,
      `/v1/reviewSubmissions/${submissionId}`,
    );
    const state = response.payload?.data?.attributes?.state;
    if (state === expectedState) return state;
    if (["UNRESOLVED_ISSUES", "COMPLETE"].includes(state)) {
      throw new Error(`Review submission entered unexpected state ${state}.`);
    }
    await delay(2_000);
  }
  throw new Error(`Review submission did not enter ${expectedState} in time.`);
}

async function main() {
  const configuration = loadAppleConfiguration();
  const version = await findVersion(configuration);
  const initialBuild = await verifyBuild(configuration, version.id);
  const activeSubmission = await findActiveSubmission(configuration, version.id);
  if (activeSubmission.attributes?.state !== "WAITING_FOR_REVIEW") {
    throw new Error(`Review is ${activeSubmission.attributes?.state}; automatic append is not safe.`);
  }

  console.log(`Verified version ${VERSION}, build ${initialBuild.version}, review ${activeSubmission.id}.`);
  assertWithdrawalApproval(activeSubmission.id);
  await updateSubmission(configuration, activeSubmission.id, { canceled: true });
  const unlocked = await waitForCancellation(configuration, activeSubmission.id, version.id);
  console.log(`Review unlocked: submission=${unlocked.submissionState}, version=${unlocked.versionState}.`);

  const appended = await appendAppStoreScreenshots({ configuration });
  const finalBuild = await verifyBuild(configuration, version.id);
  if (finalBuild.id !== initialBuild.id) throw new Error("Selected build changed during screenshot append.");

  const newSubmission = await createReviewSubmission(configuration);
  await addVersionToSubmission(configuration, newSubmission.id, version.id);
  if (!await submissionContainsVersion(configuration, newSubmission.id, version.id)) {
    throw new Error("The new review submission does not contain the expected app version.");
  }
  await updateSubmission(configuration, newSubmission.id, { submitted: true });
  const finalReviewState = await waitForReviewState(
    configuration,
    newSubmission.id,
    "WAITING_FOR_REVIEW",
  );
  const verifiedBuild = await verifyBuild(configuration, version.id);

  console.log(JSON.stringify({
    ok: true,
    version: VERSION,
    versionId: version.id,
    build: verifiedBuild,
    canceledSubmissionId: activeSubmission.id,
    newSubmissionId: newSubmission.id,
    reviewState: finalReviewState,
    screenshots: appended.result,
  }, null, 2));
}

main().catch((error) => {
  const status = error && typeof error === "object" && "status" in error ? ` HTTP ${error.status}` : "";
  const codes = error && typeof error === "object" && Array.isArray(error.codes)
    ? ` [${error.codes.join(", ")}]`
    : "";
  console.error(`${error instanceof Error ? error.message : String(error)}${status}${codes}`);
  process.exitCode = 1;
});
