import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCorrelationId } from "@logivya/logging";

async function main() {
const [proxy, worker, provider, instrumentation, client, retention, alerting] = await Promise.all([
  readFile("src/proxy.ts", "utf8"),
  readFile("src/worker/index.ts", "utf8"),
  readFile("src/worker/baileys-provider.ts", "utf8"),
  readFile("src/instrumentation.ts", "utf8"),
  readFile("apps/mobile/src/api/client.ts", "utf8"),
  readFile("src/server/observability/retention.ts", "utf8"),
  readFile("src/server/observability/alerts.ts", "utf8"),
]);
assert.equal(normalizeCorrelationId("valid-correlation-123", "fallback"), "valid-correlation-123");
assert.equal(normalizeCorrelationId("bad id", "fallback-12345678"), "fallback-12345678");
assert(proxy.includes('requestHeaders.set("x-request-id", requestId)'));
assert(proxy.includes('response.headers.set("x-correlation-id", correlationId)'));
assert(client.includes('headers.set("X-Logivya-Version-Code"'));
assert(instrumentation.includes("web.request.unhandled_error"));
assert(worker.includes("durationMs"));
assert(worker.includes("finalAttempt"));
assert(provider.includes('actorType: "SERVICE"'));
assert(provider.includes("sanitizeLogMetadata(metadata)"));
assert(provider.includes("releaseVersion: process.env.LOG_RELEASE_VERSION"));
assert(provider.includes('auditAccount(accountId, "whatsapp.groups.synced", { count: groups.length }, syncCorrelationId)'));
assert(retention.includes('LOG_RETENTION_ENFORCEMENT !== "true"'));
assert(!retention.includes("auditLog.delete"), "Retention must never delete immutable audit logs.");
assert(alerting.includes("dedupeKey"));
process.stdout.write("Request, mobile, worker, retention and alert integration contracts passed.\n");
}

void main();
