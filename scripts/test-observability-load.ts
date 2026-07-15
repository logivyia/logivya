import assert from "node:assert/strict";
import { redactSensitive } from "@logivya/logging";

const started = performance.now();
let bytes = 0;
for (let index = 0; index < 20_000; index += 1) {
  const result = redactSensitive({
    eventName: "load.test",
    requestId: `request-${index}`,
    password: "TEST_PASSWORD_SECRET",
    payload: { contacts: Array.from({ length: 75 }, (_, item) => ({ phoneNumber: `+9055500${item}`, messageBody: "private" })) },
  });
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("TEST_PASSWORD_SECRET"));
  assert(!serialized.includes("private"));
  bytes += serialized.length;
}
const durationMs = performance.now() - started;
assert(durationMs < 15_000, `Redaction load test exceeded budget: ${durationMs.toFixed(0)}ms`);
assert(bytes < 80_000_000, "Bounded serializer produced excessive output.");
process.stdout.write(`Observability load test passed: 20,000 events in ${durationMs.toFixed(0)}ms.\n`);
