import process from "node:process";

import {
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const VERSION = process.env.IOS_MARKETING_VERSION?.trim() || "1.0";
const TARGET_BUILD = process.env.IOS_BUILD_NUMBER?.trim();
const PREPARE_ONLY = process.env.APPLE_REVIEW_PREPARE_ONLY === "YES";
const DRAFT_ONLY = process.env.APPLE_REVIEW_DRAFT_ONLY === "YES";
const EDITABLE_VERSION_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
]);

if (!TARGET_BUILD || !/^\d+$/u.test(TARGET_BUILD)) {
  throw new Error("IOS_BUILD_NUMBER must identify the validated replacement build.");
}
if (PREPARE_ONLY && DRAFT_ONLY) {
  throw new Error("Choose either APPLE_REVIEW_PREPARE_ONLY or APPLE_REVIEW_DRAFT_ONLY, not both.");
}

function resources(response) {
  return Array.isArray(response?.payload?.data) ? response.payload.data : [];
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function write(configuration, pathname, method, body) {
  return appStoreConnectRequest(configuration, pathname, {}, { method, body });
}

function assertWithdrawalApproval(submissionId) {
  const approved = process.env.APPLE_REVIEW_WITHDRAWAL_APPROVED === "YES";
  const approvedSubmissionId = process.env.APPLE_REVIEW_WITHDRAWAL_SUBMISSION_ID?.trim();
  if (!approved || approvedSubmissionId !== submissionId) {
    throw new Error(
      `Review withdrawal blocked. Explicitly approve submission ${submissionId} before replacing its build.`,
    );
  }
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
  const version = resources(response)[0];
  if (!version) throw new Error(`App Store version ${VERSION} was not found.`);
  return version;
}

async function findTargetBuild(configuration) {
  const response = await appStoreConnectRequest(configuration, "/v1/builds", {
    "filter[app]": configuration.appStoreAppId,
    "filter[version]": TARGET_BUILD,
    limit: 10,
  });
  const build = resources(response).find(
    (candidate) =>
      String(candidate.attributes?.version || "") === TARGET_BUILD &&
      candidate.attributes?.processingState === "VALID" &&
      candidate.attributes?.expired !== true,
  );
  if (!build) throw new Error(`A valid, non-expired iOS build ${TARGET_BUILD} was not found.`);
  return build;
}

async function getVersion(configuration, versionId) {
  const response = await appStoreConnectRequest(configuration, `/v1/appStoreVersions/${versionId}`, {
    "fields[appStoreVersions]": "versionString,appStoreState,platform",
  });
  return response.payload?.data;
}

async function getAttachedBuild(configuration, versionId) {
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${versionId}/build`,
    { "fields[builds]": "version,processingState,expired" },
  );
  return response.payload?.data;
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
  const response = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/reviewSubmissions`,
    { "filter[platform]": "IOS", limit: 200 },
  );
  const candidates = resources(response).filter((submission) =>
    ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(submission.attributes?.state),
  );
  for (const submission of candidates) {
    if (await submissionContainsVersion(configuration, submission.id, versionId)) return submission;
  }
  return null;
}

async function updateSubmission(configuration, submissionId, attributes) {
  return write(configuration, `/v1/reviewSubmissions/${submissionId}`, "PATCH", {
    data: {
      type: "reviewSubmissions",
      id: submissionId,
      attributes,
    },
  });
}

async function waitUntilEditable(configuration, versionId, submissionId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const [version, submissionResponse] = await Promise.all([
      getVersion(configuration, versionId),
      appStoreConnectRequest(configuration, `/v1/reviewSubmissions/${submissionId}`),
    ]);
    const versionState = version?.attributes?.appStoreState;
    const submissionState = submissionResponse.payload?.data?.attributes?.state;
    if (EDITABLE_VERSION_STATES.has(versionState) && submissionState !== "WAITING_FOR_REVIEW") {
      return { versionState, submissionState };
    }
    await delay(2_000);
  }
  throw new Error("Apple did not unlock the app version after review cancellation in time.");
}

async function attachBuild(configuration, versionId, buildId) {
  await write(
    configuration,
    `/v1/appStoreVersions/${versionId}/relationships/build`,
    "PATCH",
    { data: { type: "builds", id: buildId } },
  );
  const attached = await getAttachedBuild(configuration, versionId);
  if (
    attached?.id !== buildId ||
    String(attached?.attributes?.version || "") !== TARGET_BUILD ||
    attached?.attributes?.processingState !== "VALID"
  ) {
    throw new Error("Apple did not persist the validated replacement build.");
  }
  return attached;
}

async function createSubmission(configuration, versionId, submitForReview = true) {
  const created = await write(configuration, "/v1/reviewSubmissions", "POST", {
    data: {
      type: "reviewSubmissions",
      relationships: {
        app: { data: { type: "apps", id: configuration.appStoreAppId } },
      },
    },
  });
  const submission = created.payload?.data;
  if (!submission?.id) throw new Error("Apple did not create a replacement review submission.");

  await write(configuration, "/v1/reviewSubmissionItems", "POST", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
        appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
      },
    },
  });
  if (!(await submissionContainsVersion(configuration, submission.id, versionId))) {
    throw new Error("The replacement review submission does not contain the expected app version.");
  }
  if (submitForReview) {
    await updateSubmission(configuration, submission.id, { submitted: true });
  }
  return submission;
}

async function waitForReview(configuration, submissionId, versionId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const [submissionResponse, version, attached] = await Promise.all([
      appStoreConnectRequest(configuration, `/v1/reviewSubmissions/${submissionId}`),
      getVersion(configuration, versionId),
      getAttachedBuild(configuration, versionId),
    ]);
    const submissionState = submissionResponse.payload?.data?.attributes?.state;
    const versionState = version?.attributes?.appStoreState;
    const attachedBuild = String(attached?.attributes?.version || "");
    if (
      submissionState === "WAITING_FOR_REVIEW" &&
      versionState === "WAITING_FOR_REVIEW" &&
      attachedBuild === TARGET_BUILD
    ) {
      return { submissionState, versionState, attachedBuild };
    }
    if (["UNRESOLVED_ISSUES", "COMPLETE"].includes(submissionState)) {
      throw new Error(`Replacement review entered unexpected state ${submissionState}.`);
    }
    await delay(2_000);
  }
  throw new Error("The replacement submission did not reach Waiting for Review in time.");
}

async function main() {
  const configuration = loadAppleConfiguration();
  const [version, targetBuild] = await Promise.all([
    findVersion(configuration),
    findTargetBuild(configuration),
  ]);
  const currentVersion = await getVersion(configuration, version.id);
  const activeSubmission = await findActiveSubmission(configuration, version.id);

  if (activeSubmission?.attributes?.state === "IN_REVIEW") {
    throw new Error("The app is already In Review; automatic build replacement is not safe.");
  }

  let canceledSubmissionId = null;
  if (activeSubmission) {
    if (activeSubmission.attributes?.state !== "WAITING_FOR_REVIEW") {
      throw new Error(`Unexpected active review state ${activeSubmission.attributes?.state}.`);
    }
    assertWithdrawalApproval(activeSubmission.id);
    canceledSubmissionId = activeSubmission.id;
    await updateSubmission(configuration, activeSubmission.id, { canceled: true });
    await waitUntilEditable(configuration, version.id, activeSubmission.id);
  } else if (!EDITABLE_VERSION_STATES.has(currentVersion?.attributes?.appStoreState)) {
    throw new Error(
      `Version ${VERSION} is not editable (${currentVersion?.attributes?.appStoreState || "UNKNOWN"}).`,
    );
  }

  const attached = await attachBuild(configuration, version.id, targetBuild.id);
  if (PREPARE_ONLY) {
    console.log(JSON.stringify({
      ok: true,
      version: VERSION,
      versionId: version.id,
      build: {
        id: attached.id,
        number: attached.attributes?.version,
        processingState: attached.attributes?.processingState,
      },
      canceledSubmissionId,
      newSubmissionId: null,
      reviewSubmitted: false,
      phase: "PREPARED_WITHOUT_SUBMISSION",
    }, null, 2));
    return;
  }

  const submission = await createSubmission(configuration, version.id, !DRAFT_ONLY);
  if (DRAFT_ONLY) {
    const submissionResponse = await appStoreConnectRequest(
      configuration,
      `/v1/reviewSubmissions/${submission.id}`,
    );
    console.log(JSON.stringify({
      ok: true,
      version: VERSION,
      versionId: version.id,
      build: {
        id: attached.id,
        number: attached.attributes?.version,
        processingState: attached.attributes?.processingState,
      },
      canceledSubmissionId,
      newSubmissionId: submission.id,
      submissionState: submissionResponse.payload?.data?.attributes?.state || null,
      reviewSubmitted: false,
      phase: "DRAFT_READY_FOR_USER_SUBMISSION",
    }, null, 2));
    return;
  }
  const finalState = await waitForReview(configuration, submission.id, version.id);

  console.log(JSON.stringify({
    ok: true,
    version: VERSION,
    versionId: version.id,
    build: {
      id: attached.id,
      number: attached.attributes?.version,
      processingState: attached.attributes?.processingState,
    },
    canceledSubmissionId,
    newSubmissionId: submission.id,
    ...finalState,
  }, null, 2));
}

main().catch((error) => {
  if (error instanceof AppStoreConnectError) {
    console.error(JSON.stringify({
      ok: false,
      httpStatus: error.status,
      errorCodes: error.codes,
    }));
  } else {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected App Store replacement failure.",
    }));
  }
  process.exitCode = 1;
});
