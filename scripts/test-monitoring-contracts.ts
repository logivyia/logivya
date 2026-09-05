import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  aggregateHealthState,
  evaluateLatency,
  evaluateDeploymentReleaseEvidence,
  evaluateQueueBacklog,
  evaluateWorkerHeartbeat,
  publicHealthResponse,
  validateMetricLabels,
} from "../src/server/monitoring/contracts";
import { validateTemplateEmailInput } from "../src/server/email/provider";

assert.equal(aggregateHealthState([{ state: "HEALTHY", tier: 0 }]), "HEALTHY");
assert.equal(aggregateHealthState([{ state: "UNKNOWN", tier: 0 }]), "DEGRADED");
assert.equal(aggregateHealthState([{ state: "UNAVAILABLE", tier: 0 }]), "UNAVAILABLE");
assert.equal(aggregateHealthState([{ state: "HEALTHY", tier: 0 }, { state: "UNKNOWN", tier: 1 }]), "UNKNOWN");
assert.equal(evaluateLatency(20, 100, 500), "HEALTHY");
assert.equal(evaluateLatency(200, 100, 500), "DEGRADED");
assert.equal(evaluateLatency(700, 100, 500), "UNAVAILABLE");

const now = Date.now();
assert.equal(evaluateWorkerHeartbeat({ lastHeartbeatAt: new Date(now - 10_000).toISOString(), status: "HEALTHY" }, now, 60_000), "HEALTHY");
assert.equal(evaluateWorkerHeartbeat({ lastHeartbeatAt: new Date(now - 90_000).toISOString(), status: "HEALTHY" }, now, 60_000), "DEGRADED");
assert.equal(evaluateWorkerHeartbeat({ lastHeartbeatAt: new Date(now - 130_000).toISOString(), status: "HEALTHY" }, now, 60_000), "UNAVAILABLE");
assert.equal(evaluateWorkerHeartbeat(null, now, 60_000), "UNKNOWN");
assert.equal(evaluateDeploymentReleaseEvidence("web-release-11", "worker-release-4"), "HEALTHY");
assert.equal(evaluateDeploymentReleaseEvidence("web-release-11", ""), "UNKNOWN");
assert.equal(evaluateDeploymentReleaseEvidence(null, "worker-release-4"), "UNKNOWN");

assert.equal(evaluateQueueBacklog({ waiting: 0, active: 0, workerCount: 1, oldestWaitingAgeMs: null, throughputPerMinute: 0, stale: false }), "HEALTHY");
assert.equal(evaluateQueueBacklog({ waiting: 1, active: 0, workerCount: 0, oldestWaitingAgeMs: 1_000, throughputPerMinute: 0, stale: false }), "UNAVAILABLE");
assert.equal(evaluateQueueBacklog({ waiting: 10, active: 1, workerCount: 1, oldestWaitingAgeMs: 6 * 60_000, throughputPerMinute: 1, stale: false }), "DEGRADED");
assert.equal(evaluateQueueBacklog({ waiting: 0, active: 0, workerCount: 1, oldestWaitingAgeMs: null, throughputPerMinute: 0, stale: true }), "UNKNOWN");

assert.deepEqual(Object.keys(publicHealthResponse("HEALTHY")), ["status"]);
assert.deepEqual(publicHealthResponse("HEALTHY"), { status: "ok" });
assert.deepEqual(publicHealthResponse("UNKNOWN"), { status: "degraded" });
assert.deepEqual(validateMetricLabels({ service: "worker", environment: "production", result: "success" }), { service: "worker", environment: "production", result: "success" });
assert.throws(() => validateMetricLabels({ userId: "user-1" }), /METRIC_LABEL_NOT_ALLOWED/);
assert.throws(() => validateMetricLabels({ service: "burak@example.com" }), /METRIC_LABEL_HIGH_CARDINALITY/);
assert.throws(() => validateMetricLabels({ service: "+905551112233" }), /METRIC_LABEL_HIGH_CARDINALITY/);

assert.equal(validateTemplateEmailInput({ to: "ops@example.test", template: "password_reset", variables: { code: "123456" } }).valid, true);
assert.deepEqual(validateTemplateEmailInput({ to: "ops@example.test", template: "password_reset", variables: {} }), { valid: false, missing: ["code"] });
assert.equal(validateTemplateEmailInput({ to: "ops@example.test", template: "welcome", variables: { title: "Welcome", message: "Ready" } }).valid, true);
assert.equal(validateTemplateEmailInput({ to: "ops@example.test", template: "support_created", variables: { ticketNumber: "SUP-1" } }).valid, false);

const publicRoutes = [
  "src/app/api/health/route.ts",
  "src/app/api/health/db/route.ts",
  "src/app/api/health/redis/route.ts",
  "src/app/api/health/queue/route.ts",
  "src/app/api/health/worker/route.ts",
  "src/app/api/health/whatsapp/route.ts",
].map((file) => readFileSync(file, "utf8"));
for (const source of publicRoutes) {
  assert(!source.includes("sourceCommit"));
  assert(!source.includes("releaseMarker"));
  assert(!source.includes("workerId"));
  assert(!source.includes("process.env.REDIS_URL"));
}

process.stdout.write("Monitoring health, label, redaction, heartbeat, queue and email-template contracts passed.\n");
