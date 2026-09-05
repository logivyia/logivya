import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  appStoreConnectRequest,
  loadAppleConfiguration,
  repoRoot,
} from "./app-store-connect-client.mjs";

const TARGET_VERSION = "1.0.11";
const TARGET_BUILD = "185";
const APPLY_APPROVAL = "ALLOW_PRODUCTION_APP_REVIEW_PROVISION";
const apply = process.argv.includes("--apply");

if (apply && process.env[APPLY_APPROVAL] !== "YES") {
  throw new Error(`${APPLY_APPROVAL}=YES is required for --apply.`);
}

const configuration = loadAppleConfiguration();
const versions = await appStoreConnectRequest(
  configuration,
  `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
  {
    "filter[platform]": "IOS",
    "filter[versionString]": TARGET_VERSION,
    limit: 10,
  },
);
const version = (versions.payload?.data ?? []).find(
  (entry) => entry.attributes?.versionString === TARGET_VERSION,
);
if (!version?.id || version.attributes?.appStoreState !== "PREPARE_FOR_SUBMISSION") {
  throw new Error("APP_REVIEW_VERSION_NOT_EDITABLE");
}
const [reviewDetail, attachedBuild] = await Promise.all([
  appStoreConnectRequest(configuration, `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`),
  appStoreConnectRequest(configuration, `/v1/appStoreVersions/${version.id}/build`),
]);
if (
  attachedBuild.payload?.data?.attributes?.version !== TARGET_BUILD
  || attachedBuild.payload?.data?.attributes?.processingState !== "VALID"
) {
  throw new Error("APP_REVIEW_BUILD_NOT_VALID_OR_SELECTED");
}
const identifier = reviewDetail.payload?.data?.attributes?.demoAccountName?.trim();
const password = reviewDetail.payload?.data?.attributes?.demoAccountPassword;
if (!identifier || !password) throw new Error("APP_REVIEW_CREDENTIALS_NOT_CONFIGURED");

const apiOrigin = new URL(process.env.APP_REVIEW_API_ORIGIN || "https://www.logivya.com").origin;
const loginResponse = await fetch(new URL("/api/mobile/auth/login", apiOrigin), {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Client-Platform": "ios",
    "X-Logivya-App-Version": TARGET_VERSION,
    "X-Logivya-Version-Code": TARGET_BUILD,
  },
  body: JSON.stringify({
    identifier,
    password,
    deviceId: "app-review-entitlement-provision",
    platform: "ios",
    appVersion: TARGET_VERSION,
  }),
  signal: AbortSignal.timeout(20_000),
});
const login = await loginResponse.json();
const accessToken = login?.data?.tokens?.accessToken;
if (!loginResponse.ok || login?.success !== true || login?.data?.mfaRequired === true || !accessToken) {
  throw new Error("APP_REVIEW_LOGIN_FAILED");
}
const meResponse = await fetch(new URL("/api/mobile/auth/me", apiOrigin), {
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-Client-Platform": "ios",
    "X-Logivya-App-Version": TARGET_VERSION,
    "X-Logivya-Version-Code": TARGET_BUILD,
  },
  signal: AbortSignal.timeout(20_000),
});
const me = await meResponse.json();
const userId = me?.data?.user?.id;
if (!meResponse.ok || me?.success !== true || !/^[a-z0-9_-]{10,80}$/iu.test(userId || "")) {
  throw new Error("APP_REVIEW_USER_ID_NOT_RESOLVED");
}

const remoteProgram = readFileSync(
  path.join(repoRoot, "scripts", "apple", "production-review-entitlement-worker.cjs"),
  "utf8",
);

const encodedProgram = Buffer.from(remoteProgram, "utf8").toString("base64");
const sshTarget = process.env.LOGIVYA_PRODUCTION_SSH_TARGET || "deploy@167.233.249.193";
const remoteCommand = [
  "sudo docker exec",
  `-e APP_REVIEW_USER_ID=${userId}`,
  `-e APP_REVIEW_VERSION_ID=${version.id}`,
  `-e APP_REVIEW_APPLY=${apply ? "YES" : "NO"}`,
  "logivya-web node -e",
  '"eval(Buffer.from(process.argv[1],\'base64\').toString(\'utf8\'))"',
  encodedProgram,
].join(" ");
const result = spawnSync(
  "ssh",
  ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", sshTarget, remoteCommand],
  { cwd: repoRoot, encoding: "utf8", env: process.env },
);
if (result.status !== 0) {
  throw new Error(`APP_REVIEW_REMOTE_PROVISION_FAILED:${result.stderr.trim() || result.stdout.trim()}`);
}
const output = result.stdout.trim().split(/\r?\n/u).at(-1);
const provisioned = JSON.parse(output || "{}");
if (!provisioned.ok || (apply && !provisioned.alreadyReady)) {
  throw new Error("APP_REVIEW_PROFESSIONAL_ACCESS_NOT_VERIFIED");
}
console.log(JSON.stringify({
  ok: true,
  target: { version: TARGET_VERSION, build: TARGET_BUILD },
  ...provisioned,
}, null, 2));
