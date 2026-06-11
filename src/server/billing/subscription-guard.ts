export const BILLING_PROFILE_REQUIRED_MESSAGE = "Please complete your billing information before upgrading your subscription.";

export type BillingProfileSummary = {
  billingType: "INDIVIDUAL" | "COMPANY";
  legalName?: string | null;
  fullName?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  addressLine1?: string | null;
  billingEmail?: string | null;
};
export function isBillingProfileComplete(profile: BillingProfileSummary | null | undefined) {
  if (!profile?.addressLine1 || !profile.billingEmail) return false;
  if (profile.billingType === "COMPANY") return Boolean(profile.legalName && profile.taxOffice && profile.taxNumber);
  return Boolean(profile.fullName);
}
export function requireBillingProfileForPaidActivation(profile: BillingProfileSummary | null | undefined, monthlyPrice: number) {
  if (monthlyPrice > 0 && !isBillingProfileComplete(profile)) throw new Error(BILLING_PROFILE_REQUIRED_MESSAGE);
}
