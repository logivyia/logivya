import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const proxy = readFileSync("src/proxy.ts", "utf8");
assert(
  proxy.includes('request.nextUrl.pathname.startsWith("/api/admin/")'),
  "Proxy must protect all admin APIs",
);
assert(
  proxy.includes("CSRF_REJECTED"),
  "Proxy must reject cross-origin admin mutations",
);

const guard = readFileSync("src/server/auth/platform-admin.ts", "utf8");
for (const required of [
  "hasAdminPermission",
  "ADMIN_SESSION_MAX_MS",
  "enforceAdminRateLimit",
  "assertAdminCsrf",
  "ADMIN_RECENT_AUTH_REQUIRED",
]) {
  assert(guard.includes(required), `Admin guard is missing ${required}`);
}
assert(
  guard.includes("const isOwner = isAuthorizedLogivyaPlatformAdmin"),
  "Admin authorization must be derived from the server-side owner email check",
);

const permissions = readFileSync(
  "src/server/auth/admin-permissions.ts",
  "utf8",
);
assert(
  permissions.includes("return LEGACY_PERMISSION_ALIASES[permission] ?? null"),
  "Unknown administrator permissions must fail closed instead of falling back to dashboard access",
);
for (const criticalPermission of [
  "admin.users.update",
  "admin.security.update",
  "admin.incidents.update",
]) {
  assert(
    permissions.includes(`"${criticalPermission}"`),
    `Missing critical administrator permission: ${criticalPermission}`,
  );
}

const securityMutation = readFileSync(
  "src/app/api/admin/security/events/[id]/route.ts",
  "utf8",
);
assert(
  securityMutation.includes("requireCriticalAdminAction") &&
    securityMutation.includes('"admin.security.update"'),
  "Security event mutations must require recent administrator authentication and a reason",
);
const incidentMutation = readFileSync(
  "src/app/api/admin/incidents/[id]/route.ts",
  "utf8",
);
assert(
  incidentMutation.includes("requireCriticalAdminAction") &&
    incidentMutation.includes('"admin.incidents.update"'),
  "Incident mutations must require recent administrator authentication and a reason",
);
for (const isolatedPermission of [
  "admin.notifications.read",
  "admin.notifications.update",
  "admin.systemHealth.read",
  "admin.releases.read",
]) {
  assert(
    permissions.includes(`"${isolatedPermission}"`),
    `Missing isolated administrator permission: ${isolatedPermission}`,
  );
}
assert(
  guard.includes(
    "const record = isOwner\n    ? createOwnerPlatformAdminRecord(",
  ),
  "The platform owner's SUPER_ADMIN access must not be downgraded by a stale database role",
);
assert(
  !guard.includes(
    "if (context.sessionCreatedAt < new Date(Date.now() - ADMIN_SESSION_MAX_MS))",
  ),
  "A valid session must not hide the entire admin interface after eight hours",
);
assert(
  guard.includes("request &&") &&
    guard.includes("isCriticalAdminPermission(permission) &&") &&
    guard.includes("context.sessionCreatedAt <"),
  "The eight-hour admin session cap must be limited to critical API actions",
);

const config = readFileSync("next.config.ts", "utf8");
for (const header of [
  "Content-Security-Policy",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Strict-Transport-Security",
  "Permissions-Policy",
]) {
  assert(config.includes(header), `Missing security header: ${header}`);
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? routeFiles(target)
      : entry.name === "route.ts"
        ? [target]
        : [];
  });
}

for (const route of routeFiles("src/app/api/admin")) {
  const source = readFileSync(route, "utf8");
  assert(
    source.includes("requirePlatformAdmin") ||
      source.includes("requireCriticalAdminAction") ||
      source.includes("requireSupportSuperAdmin"),
    `Unguarded admin API: ${route}`,
  );
}

const companyDetail = readFileSync(
  "src/app/api/admin/companies/[id]/route.ts",
  "utf8",
);
for (const permission of [
  "admin.users.read",
  "admin.billing.read",
  "admin.whatsapp.read",
  "admin.support.read",
  "admin.audit.read",
]) {
  assert(
    companyDetail.includes(`can("${permission}")`),
    `Company detail must independently gate ${permission} fields`,
  );
}
for (const relationGate of [
  "owner: canReadUsers",
  "members: canReadUsers",
  "billingProfile: canReadBilling",
  "subscriptions: canReadBilling",
  "payments: canReadBilling",
  "invoices: canReadBilling",
  "accounts: canReadWhatsApp",
  "supportTickets: canReadSupport",
  "internalNotes: canReadSupport",
  "auditLogs: canReadAudit",
]) {
  assert(
    companyDetail.includes(relationGate),
    `Company detail relation is not permission-gated: ${relationGate}`,
  );
}
for (const unsafeCompanySelection of [
  "owner: true",
  "members: true",
  "billingProfile: true",
  "subscriptions: true",
  "payments: true",
  "invoices: true",
  "accounts: true",
  "supportTickets: true",
  "internalNotes: true",
  "auditLogs: true",
]) {
  assert(
    !companyDetail.includes(unsafeCompanySelection),
    `Company detail contains an unconditional sensitive relation: ${unsafeCompanySelection}`,
  );
}

const ingestionAdmin = readFileSync(
  "src/server/whatsapp-ingestion/admin.ts",
  "utf8",
);
assert(
  ingestionAdmin.includes(
    "account: { userId: input.ownerUserId, archivedAt: null }",
  ),
  "WhatsApp ingestion group reads must be restricted to the signed-in account owner",
);
assert(
  ingestionAdmin.includes("account: { userId: actorUserId, archivedAt: null }"),
  "WhatsApp ingestion group mutations must be restricted to the signed-in account owner",
);
assert(
  ingestionAdmin.includes(
    "inboundMessage: { account: { userId: input.ownerUserId, archivedAt: null } }",
  ),
  "WhatsApp ingestion review reads must not expose another owner's messages",
);
const ingestionPage = readFileSync(
  "src/app/(platform)/admin/whatsapp-live-listing-sources/page.tsx",
  "utf8",
);
assert(
  ingestionPage.includes("ownerUserId: admin.user.id"),
  "The WhatsApp ingestion server page must pass the authenticated owner scope",
);
const ingestionComponent = readFileSync(
  "src/components/admin-whatsapp-ingestion.tsx",
  "utf8",
);
assert(
  !ingestionComponent.includes("account.label"),
  "WhatsApp account labels or phone numbers must not be rendered in the source table",
);

const schema = readFileSync("prisma/schema.prisma", "utf8");
for (const model of [
  "AdminPermission",
  "AdminRolePermission",
  "AdminSessionEvent",
  "TwoFactorRecoveryCode",
  "RateLimitEvent",
]) {
  assert(schema.includes(`model ${model}`), `Missing security model: ${model}`);
}

console.log("Admin security regression guard passed.");
