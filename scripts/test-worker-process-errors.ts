import { classifyWorkerProcessError } from "../src/worker/process-errors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const error of [
  Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" }),
  Object.assign(new Error("Transaction already closed"), { code: "P2028" }),
  Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }),
  new Error("Connection Closed"),
  new Error("WHATSAPP_TRANSIENT_DISCONNECT"),
]) {
  const classified = classifyWorkerProcessError(error);
  assert(classified.recoverable, `Expected recoverable classification for ${error.message}`);
  assert(classified.code !== "UNKNOWN_UNHANDLED_REJECTION", `Expected stable error code for ${error.message}`);
}

for (const error of [
  new TypeError("Cannot read properties of undefined"),
  new Error("MESSAGE_JOB_TENANT_MISMATCH"),
]) {
  assert(!classifyWorkerProcessError(error).recoverable, `Expected fatal classification for ${error.message}`);
}

console.info("Worker process error classification checks passed.");
