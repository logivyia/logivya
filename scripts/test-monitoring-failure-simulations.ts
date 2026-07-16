import assert from "node:assert/strict";

import { aggregateHealthState, evaluateLatency, evaluateQueueBacklog, evaluateWorkerHeartbeat } from "../src/server/monitoring/contracts";

const now = Date.now();
const simulations = [
  { name: "database unavailable", actual: evaluateLatency(3_000, 500, 2_000), expected: "UNAVAILABLE" },
  { name: "database slow", actual: evaluateLatency(900, 500, 2_000), expected: "DEGRADED" },
  { name: "redis/queue evidence stale", actual: evaluateQueueBacklog({ waiting: 0, active: 0, workerCount: 1, oldestWaitingAgeMs: null, throughputPerMinute: 0, stale: true }), expected: "UNKNOWN" },
  { name: "queue has no consumer", actual: evaluateQueueBacklog({ waiting: 25, active: 0, workerCount: 0, oldestWaitingAgeMs: 30_000, throughputPerMinute: 0, stale: false }), expected: "UNAVAILABLE" },
  { name: "queue aged backlog", actual: evaluateQueueBacklog({ waiting: 25, active: 1, workerCount: 1, oldestWaitingAgeMs: 16 * 60_000, throughputPerMinute: 0.2, stale: false }), expected: "UNAVAILABLE" },
  { name: "worker heartbeat missing", actual: evaluateWorkerHeartbeat(null, now), expected: "UNKNOWN" },
  { name: "worker heartbeat stopped", actual: evaluateWorkerHeartbeat({ lastHeartbeatAt: new Date(now).toISOString(), status: "STOPPED" }, now), expected: "UNAVAILABLE" },
  { name: "worker heartbeat stale", actual: evaluateWorkerHeartbeat({ lastHeartbeatAt: new Date(now - 130_000).toISOString(), status: "HEALTHY" }, now), expected: "UNAVAILABLE" },
  { name: "critical dependency unavailable", actual: aggregateHealthState([{ state: "HEALTHY", tier: 0 }, { state: "UNAVAILABLE", tier: 0 }]), expected: "UNAVAILABLE" },
  { name: "unknown tier-zero evidence", actual: aggregateHealthState([{ state: "UNKNOWN", tier: 0 }]), expected: "DEGRADED" },
];

for (const simulation of simulations) assert.equal(simulation.actual, simulation.expected, simulation.name);
process.stdout.write(`Monitoring failure simulations passed: ${simulations.length} controlled scenarios.\n`);
