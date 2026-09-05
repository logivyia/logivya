import assert from "node:assert/strict";

import {
  evaluatePlayIntegrityPayload,
  issuePlayIntegrityChallenge,
  parsePlayIntegrityChallenge,
} from "../src/server/security/play-integrity";

process.env.PLAY_INTEGRITY_CHALLENGE_SECRET = "test-only-play-integrity-secret-with-32-bytes";
process.env.PLAY_INTEGRITY_MODE = "monitor";

const issued = issuePlayIntegrityChallenge("APP_START");
const challenge = parsePlayIntegrityChallenge(issued.challengeToken);
assert.equal(challenge.requestHash, issued.requestHash);
assert.equal(challenge.action, "APP_START");
assert.throws(
  () => parsePlayIntegrityChallenge(issued.challengeToken, challenge.expiresAt + 1),
  /PLAY_INTEGRITY_CHALLENGE_INVALID/,
);

const trustedPayload = {
  requestDetails: {
    requestPackageName: "com.logivya.mobile",
    requestHash: challenge.requestHash,
    timestampMillis: String(Date.now()),
  },
  accountDetails: { appLicensingVerdict: "LICENSED" },
  appIntegrity: {
    appRecognitionVerdict: "PLAY_RECOGNIZED",
    packageName: "com.logivya.mobile",
    versionCode: "141",
  },
  deviceIntegrity: {
    deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"],
    recentDeviceActivity: { deviceActivityLevel: "LEVEL_1" },
  },
  environmentDetails: {
    playProtectVerdict: "NO_ISSUES",
    appAccessRiskVerdict: { appsDetected: ["KNOWN_INSTALLED"] },
  },
};

const trusted = evaluatePlayIntegrityPayload(trustedPayload, challenge);
assert.equal(trusted.verified, true);
assert.deepEqual(trusted.reasons, []);

const tampered = evaluatePlayIntegrityPayload({
  ...trustedPayload,
  requestDetails: { ...trustedPayload.requestDetails, requestHash: "different-request-hash" },
  appIntegrity: { ...trustedPayload.appIntegrity, appRecognitionVerdict: "UNRECOGNIZED_VERSION" },
}, challenge);
assert.equal(tampered.verified, false);
assert.ok(tampered.reasons.includes("REQUEST_HASH_MISMATCH"));
assert.ok(tampered.reasons.includes("UNRECOGNIZED_APP"));

const unsafeDevice = evaluatePlayIntegrityPayload({
  ...trustedPayload,
  deviceIntegrity: { deviceRecognitionVerdict: [] },
  environmentDetails: {
    playProtectVerdict: "HIGH_RISK",
    appAccessRiskVerdict: { appsDetected: ["UNKNOWN_CAPTURING"] },
  },
}, challenge);
assert.equal(unsafeDevice.verified, false);
assert.ok(unsafeDevice.reasons.includes("DEVICE_INTEGRITY_FAILED"));
assert.ok(unsafeDevice.reasons.includes("PLAY_PROTECT_RISK"));
assert.ok(unsafeDevice.reasons.includes("APP_ACCESS_RISK"));

assert.throws(() => parsePlayIntegrityChallenge(`${issued.challengeToken}tampered`), /PLAY_INTEGRITY_CHALLENGE_INVALID/);

console.log("Play Integrity challenge binding and verdict checks passed.");
