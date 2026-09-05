import process from "node:process";

import {
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const TARGET_BUILD = process.env.IOS_BUILD_NUMBER?.trim();
const TARGET_SUBMISSION_ID = process.env.APPLE_REVIEW_RESUBMISSION_ID?.trim();
const APPROVED = process.env.APPLE_REVIEW_RESUBMISSION_APPROVED === "YES";
const EXPECTED_ITEM_COUNT = 6;
const ALLOWED_INITIAL_ITEM_STATES = new Set(["READY_FOR_REVIEW", "REJECTED"]);

if (!APPROVED) {
  throw new Error("Resubmission is blocked without APPLE_REVIEW_RESUBMISSION_APPROVED=YES.");
}
if (!TARGET_SUBMISSION_ID) {
  throw new Error("APPLE_REVIEW_RESUBMISSION_ID is required.");
}
if (!TARGET_BUILD || !/^\d+$/u.test(TARGET_BUILD)) {
  throw new Error("IOS_BUILD_NUMBER must identify the validated replacement build.");
}

function resources(response) {
  return Array.isArray(response?.payload?.data) ? response.payload.data : [];
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function read(configuration, pathname, searchParams = {}) {
  return appStoreConnectRequest(configuration, pathname, searchParams);
}

async function write(configuration, pathname, method, body) {
  return appStoreConnectRequest(configuration, pathname, {}, { method, body });
}

async function findVersion(configuration) {
  const response = await read(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    {
      "filter[platform]": "IOS",
      "filter[versionString]": "1.0",
      limit: 20,
    },
  );
  const version = resources(response)[0];
  if (!version?.id) throw new Error("App Store version 1.0 was not found.");
  return version;
}

async function getAttachedBuild(configuration, versionId) {
  const response = await read(configuration, `/v1/appStoreVersions/${versionId}/build`, {
    "fields[builds]": "version,processingState,expired",
  });
  return response.payload?.data;
}

async function getSubmission(configuration) {
  const response = await read(
    configuration,
    `/v1/reviewSubmissions/${TARGET_SUBMISSION_ID}`,
    { "fields[reviewSubmissions]": "platform,state,submittedDate" },
  );
  return response.payload?.data;
}

async function getSubmissionItems(configuration) {
  const response = await read(
    configuration,
    `/v1/reviewSubmissions/${TARGET_SUBMISSION_ID}/items`,
    { include: "appStoreVersion", limit: 50 },
  );
  return {
    items: resources(response),
    included: Array.isArray(response.payload?.included) ? response.payload.included : [],
  };
}

function itemStateCounts(items) {
  const counts = {};
  for (const item of items) {
    const state = String(item.attributes?.state || "UNKNOWN");
    counts[state] = (counts[state] || 0) + 1;
  }
  return counts;
}

function assertInitialState({ version, build, submission, items, included }) {
  if (version.attributes?.appStoreState !== "PREPARE_FOR_SUBMISSION") {
    throw new Error(
      `App Store version is not editable (${version.attributes?.appStoreState || "UNKNOWN"}).`,
    );
  }
  if (
    !build?.id ||
    String(build.attributes?.version || "") !== TARGET_BUILD ||
    build.attributes?.processingState !== "VALID" ||
    build.attributes?.expired === true
  ) {
    throw new Error(`Build ${TARGET_BUILD} is not valid and attached to the App Store version.`);
  }
  if (submission?.id !== TARGET_SUBMISSION_ID) {
    throw new Error("The requested App Review submission was not found.");
  }
  if (submission.attributes?.platform !== "IOS") {
    throw new Error("The requested App Review submission is not an iOS submission.");
  }
  if (submission.attributes?.state !== "UNRESOLVED_ISSUES") {
    throw new Error(
      `Submission is not awaiting issue resolution (${submission.attributes?.state || "UNKNOWN"}).`,
    );
  }
  if (items.length !== EXPECTED_ITEM_COUNT) {
    throw new Error(
      `Submission item count changed: expected ${EXPECTED_ITEM_COUNT}, found ${items.length}.`,
    );
  }
  const unexpectedItem = items.find(
    (item) => !ALLOWED_INITIAL_ITEM_STATES.has(String(item.attributes?.state || "")),
  );
  if (unexpectedItem) {
    throw new Error(
      `Submission contains an unexpected item state (${unexpectedItem.attributes?.state || "UNKNOWN"}).`,
    );
  }
  const containsVersion = included.some(
    (resource) => resource.type === "appStoreVersions" && resource.id === version.id,
  );
  if (!containsVersion) {
    throw new Error("The existing six-item submission does not contain App Store version 1.0.");
  }

  const rejectedItems = items.filter(
    (item) => String(item.attributes?.state || "") === "REJECTED",
  );
  if (rejectedItems.length !== 1) {
    throw new Error(
      `Expected exactly one rejected app-version item, found ${rejectedItems.length}.`,
    );
  }
}

async function resolveRejectedAppVersionItem(configuration, items) {
  const rejectedItem = items.find(
    (item) => String(item.attributes?.state || "") === "REJECTED",
  );
  if (!rejectedItem?.id) {
    throw new Error("The rejected app-version review item could not be identified.");
  }

  await write(configuration, `/v1/reviewSubmissionItems/${rejectedItem.id}`, "PATCH", {
    data: {
      type: "reviewSubmissionItems",
      id: rejectedItem.id,
      attributes: { resolved: true },
    },
  });

  return rejectedItem.id;
}

async function submit(configuration) {
  await write(configuration, `/v1/reviewSubmissions/${TARGET_SUBMISSION_ID}`, "PATCH", {
    data: {
      type: "reviewSubmissions",
      id: TARGET_SUBMISSION_ID,
      attributes: { submitted: true },
    },
  });
}

async function waitForReview(configuration, versionId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const [submission, versionResponse, build, itemData] = await Promise.all([
      getSubmission(configuration),
      read(configuration, `/v1/appStoreVersions/${versionId}`, {
        "fields[appStoreVersions]": "versionString,appStoreState,platform",
      }),
      getAttachedBuild(configuration, versionId),
      getSubmissionItems(configuration),
    ]);
    const version = versionResponse.payload?.data;
    const submissionState = submission?.attributes?.state;
    const versionState = version?.attributes?.appStoreState;
    const attachedBuild = String(build?.attributes?.version || "");

    if (
      submissionState === "WAITING_FOR_REVIEW" &&
      versionState === "WAITING_FOR_REVIEW" &&
      attachedBuild === TARGET_BUILD &&
      itemData.items.length === EXPECTED_ITEM_COUNT
    ) {
      return {
        submissionState,
        versionState,
        attachedBuild,
        itemCount: itemData.items.length,
        itemStates: itemStateCounts(itemData.items),
      };
    }
    if (["IN_REVIEW", "COMPLETE"].includes(submissionState)) {
      throw new Error(`Submission entered unexpected state ${submissionState}.`);
    }
    await delay(2_000);
  }
  throw new Error("The existing submission did not reach Waiting for Review in time.");
}

async function main() {
  const configuration = loadAppleConfiguration();
  const version = await findVersion(configuration);
  const [build, submission, itemData] = await Promise.all([
    getAttachedBuild(configuration, version.id),
    getSubmission(configuration),
    getSubmissionItems(configuration),
  ]);

  assertInitialState({ version, build, submission, ...itemData });
  const initialItemStates = itemStateCounts(itemData.items);
  const resolvedItemId = await resolveRejectedAppVersionItem(configuration, itemData.items);
  await submit(configuration);
  const finalState = await waitForReview(configuration, version.id);

  console.log(JSON.stringify({
    ok: true,
    submissionId: TARGET_SUBMISSION_ID,
    version: version.attributes?.versionString,
    build: TARGET_BUILD,
    preservedItemCount: EXPECTED_ITEM_COUNT,
    resolvedRejectedAppVersionItem: Boolean(resolvedItemId),
    initialItemStates,
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
      error: error instanceof Error ? error.message : "Unexpected App Review resubmission failure.",
    }));
  }
  process.exitCode = 1;
});
