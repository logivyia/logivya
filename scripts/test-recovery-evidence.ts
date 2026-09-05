import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyRecoveryEvidence, recoveryState } from "../src/server/monitoring/recovery-evidence";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const time = Date.now();
const stamp = new Date(time).toISOString();
const backup = { backupId: "production-postgres-test", startedAt: stamp, completedAt: stamp, verifiedAt: stamp, sizeBytes: 512, checksumSha256: "a".repeat(64), storageBoundaries: ["primary", "secondary"] };
const report = {
  schemaVersion: 1, generatedAt: stamp, database: backup, files: backup, drill: null,
  databaseJob: { startedAt: stamp, status: "SUCCEEDED" }, filesJob: null, drillJob: null, retentionJob: null,
  timers: { "postgres-backup": true, "recovery-files": true, "recovery-drill": true },
  policy: { databaseIntervalMinutes: 60, databaseMaxAgeMinutes: 90, filesMaxAgeHours: 26, drillMaxAgeHours: 26, databaseRpoMinutes: 90, serviceRtoHours: 4, pitrEnabled: false, independentProvider: false, immutableStorageVerified: false, keyEscrowVerified: false, fullServiceRestoreVerified: false },
};
function envelope(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value));
  return JSON.stringify({ payload: bytes.toString("base64"), signature: sign(null, bytes, privateKey).toString("base64") });
}
const valid = verifyRecoveryEvidence(envelope(report), publicPem, time);
assert.equal(valid.available, true);
assert.equal(recoveryState(valid, "database", time), "VERIFIED");
assert.equal(recoveryState(valid, "drill", time), "UNKNOWN");
assert.equal(verifyRecoveryEvidence(envelope(report), publicPem, time + 16 * 60_000).available, false);
assert.equal(verifyRecoveryEvidence(envelope({ ...report, generatedAt: new Date(time + 120_000).toISOString() }), publicPem, time).available, false);
assert.equal(verifyRecoveryEvidence(envelope({ ...report, database: { ...backup, storageBoundaries: ["primary", "primary"] } }), publicPem, time).available, false);
const corrupt = JSON.parse(envelope(report));
corrupt.payload = Buffer.from(JSON.stringify({ ...report, database: null })).toString("base64");
assert.equal(verifyRecoveryEvidence(JSON.stringify(corrupt), publicPem, time).available, false);
assert.equal(verifyRecoveryEvidence(envelope(report), generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString(), time).available, false);
assert.equal(verifyRecoveryEvidence("{}", publicPem, time).available, false);
assert.equal(verifyRecoveryEvidence("x".repeat(70000), publicPem, time).available, false);
const failed = verifyRecoveryEvidence(envelope({ ...report, databaseJob: { startedAt: stamp, status: "FAILED" } }), publicPem, time);
assert.equal(recoveryState(failed, "database", time), "FAILED");
const stopped = verifyRecoveryEvidence(envelope({ ...report, timers: {} }), publicPem, time);
assert.equal(recoveryState(stopped, "database", time), "FAILED");
const old = verifyRecoveryEvidence(envelope({ ...report, database: { ...backup, startedAt: new Date(time - 91 * 60_000).toISOString() } }), publicPem, time);
assert.equal(recoveryState(old, "database", time), "STALE");
console.log("Recovery evidence: signature, corruption, freshness, duplicate copies, stopped timer and failed job checks passed.");

const retentionLock = { checkedAt: stamp, reviewDueAt: new Date(time + 7 * 86400_000).toISOString(), method: "cloudflare-dashboard", retentionDays: 30, prefix: "logivya-backups/recovery-v1/production/", buckets: ["logivya-production-backups-primary", "logivya-production-backups-secondary"] };
const locked = { ...report, retentionLock, policy: { ...report.policy, immutableStorageVerified: true } };
const verifiedLock = verifyRecoveryEvidence(envelope(locked), publicPem, time);
assert.equal(verifiedLock.available && verifiedLock.report.policy.immutableStorageVerified, true);
assert.equal(verifyRecoveryEvidence(envelope({ ...locked, retentionLock: null }), publicPem, time).available, false);
assert.equal(verifyRecoveryEvidence(envelope({ ...locked, retentionLock: { ...retentionLock, prefix: "logivya-backups/" } }), publicPem, time).available, false);
assert.equal(verifyRecoveryEvidence(envelope({ ...locked, retentionLock: { ...retentionLock, buckets: [retentionLock.buckets[0], retentionLock.buckets[0]] } }), publicPem, time).available, false);
assert.equal(verifyRecoveryEvidence(envelope({ ...locked, retentionLock: { ...retentionLock, reviewDueAt: new Date(time + 8 * 86400_000).toISOString() } }), publicPem, time).available, false);
const futureLock = { ...retentionLock, checkedAt: new Date(time + 120_000).toISOString(), reviewDueAt: new Date(time + 7 * 86400_000 + 120_000).toISOString() };
assert.equal(verifyRecoveryEvidence(envelope({ ...locked, retentionLock: futureLock }), publicPem, time).available, false);
const later = time + 8 * 86400_000;
const reviewedLate = verifyRecoveryEvidence(envelope({ ...locked, generatedAt: new Date(later).toISOString() }), publicPem, later);
assert.equal(reviewedLate.available, true);
assert.equal(reviewedLate.available && reviewedLate.report.policy.immutableStorageVerified, false);
console.log("Retention lock: dated observation, missing proof, scope, duplicate buckets, deadline and expiry checks passed.");
