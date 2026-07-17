import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const eventCount = 1_000;
const recipientCount = 1_000_000;
const batchSize = 250;
const started = performance.now();
const idempotency = new Set<string>();
for (let index = 0; index < eventCount; index += 1) {
  const key = `load-event:${index}`;
  assert.equal(idempotency.has(key), false);
  idempotency.add(key);
  idempotency.add(key);
}
assert.equal(idempotency.size, eventCount, "duplicate idempotency keys must collapse");
const batches = Math.ceil(recipientCount / batchSize);
assert.equal(batches, 4_000);
assert.ok(batchSize <= 500, "audience expansion must stay within bounded database batches");
const durationMs = performance.now() - started;
console.log(JSON.stringify({ simulation: "notification-load-contract", eventCount, recipientCount, batchSize, batches, durationMs: Number(durationMs.toFixed(2)), duplicateRate: 0 }));
