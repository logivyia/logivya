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
  "admin.whatsappIngestion.read",
  "admin.whatsappIngestion.update",
  "admin.campaignMetrics.read",
  "admin.support.read",
  "admin.support.update",
  "admin.security.read",
  "admin.security.update",
  "admin.incidents.update",
  "admin.audit.read",
  "admin.metrics.read",
  "admin.notifications.read",
  "admin.notifications.update",
  "admin.systemHealth.read",
  "admin.releases.read",
  "admin.settings.read",
  "admin.settings.update",
  "admin.backups.read",
  "admin.backups.execute",
  "admin.disasterRecovery.execute",
  "admin.featureFlags.update",
  "admin.webhooks.update",
  "admin.apiUsage.read",
  "admin.privacy.read",
  "admin.privacy.update",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const LEGACY_PERMISSION_ALIASES: Record<string, AdminPermission> = {
  "platform:read": "admin.dashboard.read",
  "users:manage": "admin.users.update",
  "companies:manage": "admin.companies.update",
  "security:read": "admin.security.read",
  "compliance:read": "admin.audit.read",
  "privacy:read": "admin.privacy.read",
  "privacy:manage": "admin.privacy.update",
  "operations:read": "admin.dashboard.read",
  "operations:manage": "admin.settings.update",
  "admin.campaigns.read": "admin.campaignMetrics.read",
};

const ROLE_PERMISSIONS: Partial<
  Record<PlatformAdminRole, readonly AdminPermission[]>
> = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  PLATFORM_ADMIN: ADMIN_PERMISSIONS.filter(
    (permission) =>
      ![
        "admin.users.delete",
        "admin.privacy.update",
        "admin.backups.execute",
        "admin.disasterRecovery.execute",
      ].includes(permission),
  ),
  SECURITY_ADMIN: [
    "admin.dashboard.read",
    "admin.security.read",
    "admin.security.update",
    "admin.audit.read",
    "admin.whatsapp.read",
    "admin.privacy.read",
    "admin.systemHealth.read",
  ],
  COMPLIANCE_ADMIN: [
    "admin.dashboard.read",
    "admin.audit.read",
    "admin.privacy.read",
    "admin.privacy.update",
  ],
  BILLING_ADMIN: [
    "admin.dashboard.read",
    "admin.billing.read",
    "admin.subscriptions.approve",
    "admin.subscriptions.reject",
    "admin.payments.read",
    "admin.payments.confirm",
  ],
  SUPPORT_ADMIN: [
    "admin.dashboard.read",
    "admin.companies.read",
    "admin.users.read",
    "admin.support.read",
    "admin.support.update",
  ],
  OPERATIONS_ADMIN: [
    "admin.dashboard.read",
    "admin.companies.read",
    "admin.users.read",
    "admin.campaignMetrics.read",
    "admin.support.read",
    "admin.support.update",
    "admin.metrics.read",
    "admin.notifications.read",
    "admin.notifications.update",
    "admin.systemHealth.read",
    "admin.releases.read",
    "admin.apiUsage.read",
    "admin.incidents.update",
  ],
  READ_ONLY_ADMIN: ADMIN_PERMISSIONS.filter((permission) =>
    permission.endsWith(".read"),
  ),
};

export function normalizeAdminPermission(
  permission: string,
): AdminPermission | null {
  if (ADMIN_PERMISSIONS.includes(permission as AdminPermission))
    return permission as AdminPermission;
  return LEGACY_PERMISSION_ALIASES[permission] ?? null;
}

export function hasAdminPermission(
  role: PlatformAdminRole,
  overrides: readonly string[],
  permission: string,
) {
  const normalized = normalizeAdminPermission(permission);
  if (!normalized) return false;
  if (role === "SUPER_ADMIN") return true;
  if (process.env.ADMIN_DELEGATED_ROLES_ENABLED !== "true") return false;
  return (
    overrides.includes(normalized) ||
    ROLE_PERMISSIONS[role]?.includes(normalized) === true
  );
}

export function effectiveAdminPermissions(
  role: PlatformAdminRole,
  overrides: readonly string[],
) {
  if (role === "SUPER_ADMIN") return [...ADMIN_PERMISSIONS];
  if (process.env.ADMIN_DELEGATED_ROLES_ENABLED !== "true") return [];
  const normalizedOverrides = overrides
    .map(normalizeAdminPermission)
    .filter((permission): permission is AdminPermission => Boolean(permission));
  return [
    ...new Set([...(ROLE_PERMISSIONS[role] ?? []), ...normalizedOverrides]),
  ];
}

export function isCriticalAdminPermission(permission: string) {
  const normalized = normalizeAdminPermission(permission);
  if (!normalized) return false;
  return [
    "admin.companies.update",
    "admin.users.update",
    "admin.users.delete",
    "admin.subscriptions.approve",
    "admin.subscriptions.reject",
    "admin.payments.confirm",
    "admin.security.update",
    "admin.incidents.update",
    "admin.notifications.update",
    "admin.whatsapp.disconnect",
    "admin.whatsappIngestion.update",
    "admin.settings.update",
    "admin.backups.execute",
    "admin.disasterRecovery.execute",
    "admin.featureFlags.update",
    "admin.webhooks.update",
    "admin.privacy.update",
  ].includes(normalized);
}
