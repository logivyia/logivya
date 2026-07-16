import assert from "node:assert/strict";

import { aggregateHealthState, evaluateQueueBacklog, validateMetricLabels } from "../src/server/monitoring/contracts";

const started = performance.now();
let degraded = 0;
for (let index = 0; index < 100_000; index += 1) {
  const queue = evaluateQueueBacklog({
    waiting: index % 120,
    active: index % 4,
    workerCount: 3,
    oldestWaitingAgeMs: (index % 600) * 1_000,
    throughputPerMinute: 4,
    stale: false,
  });
  if (aggregateHealthState([{ state: queue, tier: 0 }]) !== "HEALTHY") degraded += 1;
  validateMetricLabels({ service: "queue", environment: "load-test", result: index % 2 ? "success" : "failed" });
}
const durationMs = performance.now() - started;
assert(durationMs < 10_000, `Monitoring evaluation load exceeded budget: ${durationMs.toFixed(0)}ms`);
assert(degraded > 0);
process.stdout.write(`Monitoring load test passed: 100,000 evaluations in ${durationMs.toFixed(0)}ms.\n`);
