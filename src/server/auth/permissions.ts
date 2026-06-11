export const PERMISSIONS = [
  "view_dashboard",
  "manage_accounts",
  "connect_accounts",
  "disconnect_accounts",
  "archive_accounts",
  "manage_groups",
  "manage_categories",
  "send_messages",
  "schedule_messages",
  "retry_campaigns",
  "cancel_campaigns",
  "delete_campaigns",
  "view_message_history",
  "view_recipients",
  "manage_users",
  "manage_billing",
  "manage_company_settings",
  "manage_api_keys",
  "view_analytics",
  "export_data",
  "manage_webhooks",
  "view_audit_logs",
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number];
export type WorkspaceRole = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";

const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly PermissionCode[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((permission) => permission !== "manage_billing"),
  OPERATOR: ["view_dashboard", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "view_message_history", "view_recipients", "view_analytics"],
  VIEWER: ["view_dashboard", "view_message_history", "view_recipients", "view_analytics"],
};
export function hasPermission(role: WorkspaceRole, permission: PermissionCode, overrides: Partial<Record<PermissionCode, boolean>> = {}) {
  return overrides[permission] ?? ROLE_PERMISSIONS[role].includes(permission);
}
export function requirePermission(role: WorkspaceRole, permission: PermissionCode, overrides?: Partial<Record<PermissionCode, boolean>>) {
  if (!hasPermission(role, permission, overrides)) throw new Error(`Missing permission: ${permission}`);
}
