import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const policy = source("src/server/auth/platform-admin.ts");
const route = source("src/app/api/admin/security/re-auth/route.ts");
const mobileApi = source("apps/mobile/src/api/mobileAdmin.ts");
const platformModuleScreen = source(
  "apps/mobile/src/screens/app/platform-module-screen.tsx",
);
const notificationOperationsScreen = source(
  "apps/mobile/src/screens/app/admin-notification-operations-screen.tsx",
);

assert.match(
  policy,
  /const RECENT_AUTH_MAX_MS = 10 \* 60_000;/,
  "The platform-admin policy must retain its existing ten-minute recent-auth window",
);
assert.match(
  route,
  /const ADMIN_REAUTH_TTL_MS = 10 \* 60_000;/,
  "The reauthentication response expiry must match the ten-minute server policy",
);
assert.match(
  route,
  /const elevatedAt = new Date\(\);[\s\S]*const expiresAt = new Date\(elevatedAt\.getTime\(\) \+ ADMIN_REAUTH_TTL_MS\);/,
  "The response expiry must derive from the same elevation instant stored by the server",
);
assert.match(
  route,
  /create: \{[\s\S]*lastElevatedAt: elevatedAt,[\s\S]*update: \{ lastElevatedAt: elevatedAt \}/,
  "Create and update paths must persist the exact elevation instant returned to clients",
);
assert.match(route, /elevatedAt: elevatedAt\.toISOString\(\)/);
assert.match(route, /expiresAt: expiresAt\.toISOString\(\)/);

assert.match(
  mobileApi,
  /export type PlatformAdminReauthentication = \{[\s\S]*elevatedAt: string;[\s\S]*expiresAt: string;/,
  "The mobile API must expose typed elevation and expiry timestamps",
);
assert.match(
  mobileApi,
  /requestRaw<PlatformAdminReauthentication>\([\s\S]*"\/api\/admin\/security\/re-auth"/,
  "The mobile reauthentication call must use the timestamp-aware contract",
);

for (const [name, screen] of [
  ["platform module screen", platformModuleScreen],
  ["notification operations screen", notificationOperationsScreen],
] as const) {
  assert.match(
    screen,
    /response\.expiresAt/,
    `${name} must retain the server-issued expiry timestamp`,
  );
  assert.match(
    screen,
    /Date\.parse\([^)]*Until\)\s*>\s*Date\.now\(\)/,
    `${name} must derive elevated state from the unexpired server timestamp`,
  );
  assert.match(
    screen,
    /setTimeout\([\s\S]*set[A-Za-z]*ElevatedUntil\(null\)/,
    `${name} must revoke elevated UI state when the ten-minute window expires`,
  );
  assert.match(
    screen,
    /error\.status === 428[\s\S]*ADMIN_RECENT_AUTH_REQUIRED/,
    `${name} must recognize backend recent-auth rejection and relock actions`,
  );
}

console.log("Admin reauthentication TTL contract tests passed.");
