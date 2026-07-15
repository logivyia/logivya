import assert from "node:assert/strict";
import { logger, setLogSinkForTests } from "@/server/observability/logger";

const captured: Array<Record<string, unknown>> = [];
setLogSinkForTests((event) => captured.push(event));
logger.child({ requestId: "request-12345678", companyId: "company-test" }).info("test.observability.safe_event", {
  correlationId: "correlation-12345678",
  password: "TEST_PASSWORD_SECRET",
  accessToken: "TEST_ACCESS_TOKEN_SECRET",
  safeMetadata: { totpSecret: "TEST_TOTP_SECRET", credentials: "TEST_WHATSAPP_CREDS_SECRET" },
});
logger.error("test.observability.safe_error", new Error("Bearer TEST_ACCESS_TOKEN_SECRET"), { route: "/test" });
setLogSinkForTests(undefined);

assert.equal(captured.length, 2);
assert.equal(captured[0].eventName, "test.observability.safe_event");
assert.equal(captured[0].requestId, "request-12345678");
assert.equal(captured[0].correlationId, "correlation-12345678");
assert.equal(captured[0].password, "[REDACTED]");
const serialized = JSON.stringify(captured);
for (const secret of ["TEST_PASSWORD_SECRET", "TEST_ACCESS_TOKEN_SECRET", "TEST_TOTP_SECRET", "TEST_WHATSAPP_CREDS_SECRET"]) {
  assert(!serialized.includes(secret), `Captured log leaked ${secret}`);
}
assert(captured.every((event) => typeof event.timestamp === "string" && typeof event.service === "string" && typeof event.environment === "string"));
process.stdout.write("Structured logger contract and secret-leak tests passed.\n");
