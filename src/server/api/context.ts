import type { PermissionCode } from "@/server/auth/permissions";

export type ApiContext = {
  companyId: string;
  apiKeyId: string;
  permissions: readonly PermissionCode[];
  rateLimit: number;
  correlationId: string;
};
export function requireApiPermission(context: ApiContext, permission: PermissionCode) {
  if (!context.permissions.includes(permission)) throw new Error(`API key lacks permission: ${permission}`);
}
