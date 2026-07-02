import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const proxy = readFileSync("src/proxy.ts", "utf8");
assert(proxy.includes('"/api/admin/:path*"'), "Proxy must protect all admin APIs");
assert(proxy.includes("CSRF_REJECTED"), "Proxy must reject cross-origin admin mutations");

const guard = readFileSync("src/server/auth/platform-admin.ts", "utf8");
for (const required of ["hasAdminPermission", "ADMIN_SESSION_MAX_MS", "enforceAdminRateLimit", "assertAdminCsrf", "ADMIN_RECENT_AUTH_REQUIRED"]) {
  assert(guard.includes(required), `Admin guard is missing ${required}`);
}

const config = readFileSync("next.config.ts", "utf8");
for (const header of ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Strict-Transport-Security", "Permissions-Policy"]) {
  assert(config.includes(header), `Missing security header: ${header}`);
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(target) : entry.name === "route.ts" ? [target] : [];
  });
}

for (const route of routeFiles("src/app/api/admin")) {
  const source = readFileSync(route, "utf8");
  assert(
    source.includes("requirePlatformAdmin") || source.includes("requireCriticalAdminAction") || source.includes("requireSupportSuperAdmin"),
    `Unguarded admin API: ${route}`,
  );
}

const schema = readFileSync("prisma/schema.prisma", "utf8");
for (const model of ["AdminPermission", "AdminRolePermission", "AdminSessionEvent", "TwoFactorRecoveryCode", "RateLimitEvent"]) {
  assert(schema.includes(`model ${model}`), `Missing security model: ${model}`);
}

console.log("Admin security regression guard passed.");
