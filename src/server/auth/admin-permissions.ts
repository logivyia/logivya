import type { PlatformAdminRole } from "@prisma/client";

export const ADMIN_PERMISSIONS = [
  "admin.dashboard.read",
  "admin.companies.read",
  "admin.companies.update",
  "admin.users.read",
  "admin.users.update",
  "admin.users.delete",
  "admin.billing.read",
  "admin.subscriptions.approve",
  "admin.subscriptions.reject",
  "admin.payments.read",
  "admin.payments.confirm",
  "admin.whatsapp.read",
  "admin.whatsapp.disconnect",
  "admin.campaigns.read",
  "admin.campaigns.delete",
  "admin.support.read",
  "admin.support.update",
  "admin.security.read",
  "admin.audit.read",
  "admin.metrics.read",
  "admin.settings.read",
  "admin.settings.update",
  "admin.backups.read",
  "admin.backups.execute",
  "admin.disasterRecovery.execute",
  "admin.featureFlags.update",
  "admin.webhooks.update",
  "admin.apiUsage.read",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const LEGACY_PERMISSION_ALIASES: Record<string, AdminPermission> = {
  "platform:read": "admin.dashboard.read",
  "users:manage": "admin.users.update",
  "companies:manage": "admin.companies.update",
  "billing:manage": "admin.billing.read",
  "security:read": "admin.security.read",
  "compliance:read": "admin.audit.read",
  "data_requests:manage": "admin.audit.read",
  "operations:read": "admin.dashboard.read",
  "operations:manage": "admin.settings.update",
};

const ROLE_PERMISSIONS: Partial<Record<PlatformAdminRole, readonly AdminPermission[]>> = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  SECURITY_ADMIN: ["admin.dashboard.read", "admin.security.read", "admin.audit.read", "admin.whatsapp.read"],
  BILLING_ADMIN: ["admin.dashboard.read", "admin.billing.read", "admin.subscriptions.approve", "admin.subscriptions.reject", "admin.payments.read", "admin.payments.confirm"],
  SUPPORT_ADMIN: ["admin.dashboard.read", "admin.companies.read", "admin.users.read", "admin.support.read", "admin.support.update"],
  READ_ONLY_ADMIN: ADMIN_PERMISSIONS.filter((permission) => permission.endsWith(".read")),
};

export function normalizeAdminPermission(permission: string): AdminPermission {
  if (ADMIN_PERMISSIONS.includes(permission as AdminPermission)) return permission as AdminPermission;
  return LEGACY_PERMISSION_ALIASES[permission] ?? "admin.dashboard.read";
}

export function hasAdminPermission(role: PlatformAdminRole, overrides: readonly string[], permission: string) {
  const normalized = normalizeAdminPermission(permission);
  if (role === "SUPER_ADMIN") return true;
  if (process.env.ADMIN_DELEGATED_ROLES_ENABLED !== "true") return false;
  return overrides.includes(normalized) || ROLE_PERMISSIONS[role]?.includes(normalized) === true;
}

export function isCriticalAdminPermission(permission: string) {
  const normalized = normalizeAdminPermission(permission);
  return [
    "admin.companies.update",
    "admin.users.delete",
    "admin.subscriptions.approve",
    "admin.subscriptions.reject",
    "admin.payments.confirm",
    "admin.whatsapp.disconnect",
    "admin.campaigns.delete",
    "admin.settings.update",
    "admin.backups.execute",
    "admin.disasterRecovery.execute",
    "admin.featureFlags.update",
    "admin.webhooks.update",
  ].includes(normalized);
}
