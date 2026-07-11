import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ApiRequestError, isAuthenticationRejection } from "../apps/mobile/src/api/api-errors";

const root = process.cwd();

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

assert.equal(
  isAuthenticationRejection(new ApiRequestError("Unauthorized", "UNAUTHORIZED", 401, "/api/mobile/auth/me")),
  true,
  "A backend 401 must invalidate the persisted mobile session."
);
assert.equal(
  isAuthenticationRejection(new ApiRequestError("Server unavailable", "INTERNAL_ERROR", 500, "/api/mobile/auth/me")),
  false,
  "A backend 500 must not invalidate the persisted mobile session."
);
assert.equal(
  isAuthenticationRejection(new ApiRequestError("Network unavailable", "NETWORK_ERROR", 0, "/api/mobile/auth/me")),
  false,
  "A network failure must not invalidate the persisted mobile session."
);

const client = read("apps/mobile/src/api/client.ts");
assert(client.includes("if (isAuthenticationRejection(error))"), "Token refresh must distinguish rejected tokens from transient failures.");
assert(client.includes("throw error;"), "Transient refresh failures must propagate without forcing logout.");

const authService = read("apps/mobile/src/auth/auth-service.ts");
assert(authService.includes("clearMobileRuntimeSessionState();"), "Transient bootstrap failures must clear runtime user data.");
assert(authService.includes("if (isAuthenticationRejection(error))"), "Session restore must clear persisted tokens only for explicit auth rejection.");

const cleanup = read("apps/mobile/src/auth/session-cleanup.ts");
assert(cleanup.includes("export function clearMobileRuntimeSessionState()"), "Runtime-only session cleanup must remain available.");
assert(cleanup.indexOf("await clearTokens();") < cleanup.indexOf("clearMobileRuntimeSessionState();"), "Full logout must clear tokens before runtime state.");

console.log("Mobile auth resilience contracts passed.");
