import assert from "node:assert/strict";

import {
  APPLY_APPROVAL_VARIABLE,
  attachAppStoreDraftBuild,
} from "./attach-app-store-draft-build.mjs";
import { AppStoreConnectError } from "./app-store-connect-client.mjs";

const configuration = {
  appStoreAppId: "6792539737",
  bundleId: "com.logivya.mobile",
  teamId: "YMW24BAWTV",
};
const confirmations = {
  appId: configuration.appStoreAppId,
  bundleId: configuration.bundleId,
  teamId: configuration.teamId,
};

function mockRequest(overrides = {}) {
  const calls = [];
  let linkedBuildNumber = overrides.linkedBuildNumber ?? "183";
  const request = async (_configuration, pathname, searchParams = {}, options = {}) => {
    const method = options.method ?? "GET";
    calls.push({ pathname, searchParams, method, body: options.body });
    if (method === "PATCH") {
      assert.equal(pathname, "/v1/appStoreVersions/version-1/relationships/build");
      assert.deepEqual(options.body, { data: { type: "builds", id: "build-185" } });
      linkedBuildNumber = "185";
      return { status: 204, payload: null };
    }
    if (pathname === "/v1/apps/6792539737") {
      return { payload: { data: { id: "6792539737", attributes: { bundleId: "com.logivya.mobile" } } } };
    }
    if (pathname.endsWith("/appStoreVersions")) {
      return {
        payload: {
          data: [{
            id: "version-1",
            attributes: {
              platform: "IOS",
              versionString: "1.0.11",
              appStoreState: overrides.state ?? "PREPARE_FOR_SUBMISSION",
              releaseType: overrides.releaseType ?? "AFTER_APPROVAL",
            },
          }],
        },
      };
    }
    if (pathname === "/v1/builds") {
      return {
        payload: {
          data: [{
            id: "build-185",
            attributes: {
              version: "185",
              processingState: overrides.processingState ?? "VALID",
              expired: overrides.expired ?? false,
            },
            relationships: { preReleaseVersion: { data: { type: "preReleaseVersions", id: "pre-1" } } },
          }],
          included: [{
            type: "preReleaseVersions",
            id: "pre-1",
            attributes: { version: overrides.marketingVersion ?? "1.0.11", platform: "IOS" },
          }],
        },
      };
    }
    if (pathname.endsWith("/appStoreVersionSubmission")) {
      if (overrides.submissionError) {
        throw new AppStoreConnectError(
          "Mock App Store Connect error.",
          overrides.submissionError.status,
          overrides.submissionError.codes,
        );
      }
      return { payload: { data: overrides.submission ?? null } };
    }
    if (pathname.endsWith("/build")) {
      return {
        payload: {
          data: linkedBuildNumber
            ? {
                id: linkedBuildNumber === "185" ? "build-185" : "build-183",
                attributes: {
                  version: linkedBuildNumber,
                  processingState: "VALID",
                  expired: false,
                },
              }
            : null,
        },
      };
    }
    if (pathname === "/v1/appStoreVersions/version-1") {
      return {
        payload: {
          data: {
            id: "version-1",
            attributes: {
              versionString: "1.0.11",
              appStoreState: overrides.state ?? "PREPARE_FOR_SUBMISSION",
              releaseType: overrides.releaseType ?? "AFTER_APPROVAL",
            },
          },
        },
      };
    }
    throw new Error(`Unexpected mock request: ${method} ${pathname}`);
  };
  return { request, calls };
}

{
  const mock = mockRequest();
  const result = await attachAppStoreDraftBuild({
    request: mock.request,
    configuration,
    confirmations,
  });
  assert.equal(result.mode, "DRY_RUN");
  assert.equal(result.mutationPerformed, false);
  assert.equal(result.wouldAttach, true);
  assert.equal(mock.calls.some((call) => call.method !== "GET"), false);
}

{
  const mock = mockRequest();
  await assert.rejects(
    attachAppStoreDraftBuild({
      request: mock.request,
      configuration,
      confirmations,
      apply: true,
      approval: "",
    }),
    new RegExp(`${APPLY_APPROVAL_VARIABLE}=YES`),
  );
  assert.equal(mock.calls.length, 0);
}

{
  const mock = mockRequest();
  const result = await attachAppStoreDraftBuild({
    request: mock.request,
    configuration,
    confirmations,
    apply: true,
    approval: "YES",
  });
  const writes = mock.calls.filter((call) => call.method !== "GET");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "PATCH");
  assert.equal(writes[0].pathname, "/v1/appStoreVersions/version-1/relationships/build");
  assert.equal(result.audit.state, true);
  assert.equal(result.audit.releaseType, true);
  assert.equal(result.audit.noVersionSubmission, true);
  assert.equal(result.audit.buildNumber, true);
}

{
  const mock = mockRequest({ linkedBuildNumber: "185" });
  const result = await attachAppStoreDraftBuild({
    request: mock.request,
    configuration,
    confirmations,
    apply: true,
    approval: "YES",
  });
  assert.equal(result.mutationPerformed, false);
  assert.equal(mock.calls.some((call) => call.method !== "GET"), false);
  assert.equal(result.audit.buildNumber, true);
}

{
  const mock = mockRequest({
    submissionError: { status: 404, codes: ["NOT_FOUND"] },
  });
  const result = await attachAppStoreDraftBuild({
    request: mock.request,
    configuration,
    confirmations,
    apply: true,
    approval: "YES",
  });
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.audit.noVersionSubmission, true);
  assert.equal(result.audit.buildNumber, true);
}

for (const submissionError of [
  { status: 404, codes: ["UNEXPECTED_CODE"] },
  { status: 500, codes: ["INTERNAL_ERROR"] },
]) {
  const mock = mockRequest({ submissionError });
  await assert.rejects(
    attachAppStoreDraftBuild({
      request: mock.request,
      configuration,
      confirmations,
    }),
    /Mock App Store Connect error/,
  );
  assert.equal(mock.calls.some((call) => call.method !== "GET"), false);
}

for (const [name, overrides, expected] of [
  ["version state", { state: "WAITING_FOR_REVIEW" }, /not in PREPARE_FOR_SUBMISSION/],
  ["release type", { releaseType: "MANUAL" }, /releaseType is not AFTER_APPROVAL/],
  ["build processing", { processingState: "PROCESSING" }, /VALID and non-expired/],
  ["expired build", { expired: true }, /VALID and non-expired/],
  ["marketing version", { marketingVersion: "1.0.10" }, /does not belong/],
  ["existing submission", { submission: { id: "submission-1" } }, /already has an App Store version submission/],
]) {
  const mock = mockRequest(overrides);
  await assert.rejects(
    attachAppStoreDraftBuild({
      request: mock.request,
      configuration,
      confirmations,
      apply: true,
      approval: "YES",
    }),
    expected,
    name,
  );
  assert.equal(mock.calls.some((call) => call.method !== "GET"), false, name);
}

console.log("App Store draft build attach safety tests passed.");
