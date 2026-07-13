import { translateCurrent } from "@/i18n/runtime";

export function formatRoleLabel(role: string | undefined, _permissions: string[] = []) {
  const normalized = role?.trim().toUpperCase();

  if (normalized === "SUPER_ADMIN") return translateCurrent("roleSuperAdmin");
  if (normalized === "ADMIN") return translateCurrent("roleAdmin");
  if (normalized === "OWNER") return translateCurrent("roleOwner");
  if (normalized === "MANAGER") return translateCurrent("roleManager");
  if (normalized === "OPERATOR" || normalized === "AGENT") return translateCurrent("roleOperator");
  if (normalized === "SUPPORT") return translateCurrent("roleSupport");
  if (!normalized) return translateCurrent("roleUser");
  return role?.trim() || translateCurrent("roleUser");
}

export function canSeeAdminHub(isPlatformAdmin?: boolean) {
  return isPlatformAdmin === true;
}
