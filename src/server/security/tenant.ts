export type TenantEntity = { id: string; companyId: string };
export type Membership = { companyId: string; status: "ACTIVE" | "INVITED" | "SUSPENDED" };

export function assertCompanyAccess(companyId: string, membership: Membership | null | undefined) {
  if (!membership || membership.companyId !== companyId || membership.status !== "ACTIVE") throw new Error("Workspace access denied");
}
export function assertEntityBelongsToCompany(companyId: string, entity: TenantEntity | null | undefined) {
  if (!entity || entity.companyId !== companyId) throw new Error("Resource not found");
  return entity;
}
export function tenantWhere<T extends object>(companyId: string, where: T) { return { ...where, companyId }; }
