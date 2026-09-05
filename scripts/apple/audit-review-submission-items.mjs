import process from "node:process";

import {
  AppStoreConnectError,
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const TARGET_SUBMISSION_ID = process.env.APPLE_REVIEW_RESUBMISSION_ID?.trim();

if (!TARGET_SUBMISSION_ID) {
  throw new Error("APPLE_REVIEW_RESUBMISSION_ID is required.");
}

function resources(response) {
  return Array.isArray(response?.payload?.data) ? response.payload.data : [];
}

function relationshipSummary(relationships) {
  return Object.fromEntries(
    Object.entries(relationships || {}).map(([name, relationship]) => {
      const data = relationship?.data;
      if (Array.isArray(data)) {
        return [name, data.map((item) => ({ type: item?.type, id: item?.id }))];
      }
      return [name, data ? { type: data.type, id: data.id } : null];
    }),
  );
}

function decodedResourceId(reviewSubmissionItemId) {
  try {
    const decoded = Buffer.from(String(reviewSubmissionItemId || ""), "base64url").toString("utf8");
    const parts = decoded.split("|");
    return parts.length >= 3 ? parts.at(-1) : null;
  } catch {
    return null;
  }
}

async function inspectVersionCandidate(configuration, candidateId) {
  if (!candidateId) return null;

  const candidates = [
    { type: "subscriptionVersions", path: `/v1/subscriptionVersions/${candidateId}` },
    { type: "subscriptionGroupVersions", path: `/v1/subscriptionGroupVersions/${candidateId}` },
  ];

  for (const candidate of candidates) {
    try {
      const response = await appStoreConnectRequest(configuration, candidate.path);
      const resource = response.payload?.data;
      if (resource?.id) {
        return {
          type: candidate.type,
          id: resource.id,
          state: resource.attributes?.state || null,
          version: resource.attributes?.version || null,
          relationships: relationshipSummary(resource.relationships),
        };
      }
    } catch (error) {
      if (!(error instanceof AppStoreConnectError) || error.status !== 404) throw error;
    }
  }

  return null;
}

async function main() {
  const configuration = loadAppleConfiguration();
  const [submissionResponse, itemsResponse, submissionsResponse] = await Promise.all([
    appStoreConnectRequest(
      configuration,
      `/v1/reviewSubmissions/${TARGET_SUBMISSION_ID}`,
      { "fields[reviewSubmissions]": "platform,state,submittedDate" },
    ),
    appStoreConnectRequest(
      configuration,
      `/v1/reviewSubmissions/${TARGET_SUBMISSION_ID}/items`,
      { limit: 50 },
    ),
    appStoreConnectRequest(
      configuration,
      `/v1/apps/${configuration.appStoreAppId}/reviewSubmissions`,
      { "filter[platform]": "IOS", limit: 200 },
    ),
  ]);

  const submission = submissionResponse.payload?.data;
  const items = resources(itemsResponse);
  const submissions = resources(submissionsResponse);
  const versionCandidates = await Promise.all(
    items.map(async (item) => ({
      reviewSubmissionItemId: item.id,
      decodedResourceId: decodedResourceId(item.id),
      resource: await inspectVersionCandidate(configuration, decodedResourceId(item.id)),
    })),
  );

  console.log(JSON.stringify({
    ok: true,
    targetSubmission: {
      id: submission?.id,
      state: submission?.attributes?.state,
      platform: submission?.attributes?.platform,
      itemCount: items.length,
    },
    items: items.map((item) => ({
      id: item.id,
      state: item.attributes?.state,
      relationships: relationshipSummary(item.relationships),
      relationshipNames: Object.keys(item.relationships || {}),
    })),
    versionCandidates,
    submissions: submissions.map((candidate) => ({
      id: candidate.id,
      state: candidate.attributes?.state,
      platform: candidate.attributes?.platform,
      submittedDate: candidate.attributes?.submittedDate || null,
    })),
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
      error: error instanceof Error ? error.message : "Unexpected App Review audit failure.",
    }));
  }
  process.exitCode = 1;
});
