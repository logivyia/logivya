import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";

export async function getEffectiveMessagingPlan(companyId: string, at = new Date()) {
  return resolveCompanyEntitlements(companyId, undefined, at);
}

export function requiresMessageAttribution(
  effectivePlan: Awaited<ReturnType<typeof getEffectiveMessagingPlan>>,
) {
  return Boolean(effectivePlan?.valid && effectivePlan.entitlements.messageBrandingRequired);
}
