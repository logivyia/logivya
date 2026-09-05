import { translateCurrent } from "@/i18n/runtime";

export function formatRoleLabel(
  role: string | undefined,
  _permissions: string[] = [],
) {
  const normalized = role?.trim().toUpperCase();

  if (normalized === "SUPER_ADMIN") return translateCurrent("roleSuperAdmin");
  if (normalized === "PLATFORM_ADMIN") return translateCurrent("roleAdmin");
  if (normalized === "SECURITY_ADMIN") return translateCurrent("security");
  if (normalized === "COMPLIANCE_ADMIN")
    return translateCurrent("adminComplianceModule");
  if (normalized === "BILLING_ADMIN")
    return translateCurrent("adminBillingModule");
  if (normalized === "SUPPORT_ADMIN") return translateCurrent("support");
  if (normalized === "OPERATIONS_ADMIN")
    return translateCurrent("adminControlCenter");
  if (normalized === "READ_ONLY_ADMIN") return translateCurrent("roleUser");
  if (normalized === "ADMIN") return translateCurrent("roleAdmin");
  if (normalized === "OWNER") return translateCurrent("roleOwner");
  if (normalized === "MANAGER") return translateCurrent("roleManager");
  if (normalized === "OPERATOR" || normalized === "AGENT")
    return translateCurrent("roleOperator");
  if (normalized === "SUPPORT") return translateCurrent("roleSupport");
  if (!normalized) return translateCurrent("roleUser");
  return role?.trim() || translateCurrent("roleUser");
}

export function canSeeAdminHub(
  isPlatformAdmin?: boolean,
  adminPermissions: readonly string[] = [],
) {
  return (
    isPlatformAdmin === true &&
    adminPermissions.includes("admin.dashboard.read")
  );
}

export function canManageOwnerProfile(isPlatformAdmin?: boolean) {
  return isPlatformAdmin === true;
}
