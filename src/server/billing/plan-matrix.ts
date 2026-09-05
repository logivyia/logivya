import {
  CANONICAL_SUBSCRIPTION_PLANS,
  PURCHASABLE_SUBSCRIPTION_PLAN_CODES,
  SUBSCRIPTION_PLAN_CODES,
  canonicalSubscriptionPlanCode,
} from "@/config/subscription-plans";

export const CORE_PLAN_CODES = SUBSCRIPTION_PLAN_CODES;
export const PURCHASABLE_PLAN_CODES = PURCHASABLE_SUBSCRIPTION_PLAN_CODES;

export type CorePlanCode = (typeof CORE_PLAN_CODES)[number];
export type PurchasablePlanCode = (typeof PURCHASABLE_PLAN_CODES)[number];

export type CorePlanRule = {
  monthlyPriceTry: number;
  yearlyPriceTry: number;
  yearlyMonthlyEquivalentTry: number;
  totalUserSeats: number;
  whatsappConnections: number;
  groupMessaging: boolean;
  contactMessaging: boolean;
  scheduledMessaging: boolean;
  recurringMessaging: boolean;
  deleteForEveryone: boolean;
  advancedSupport: boolean;
  advertisingEnabled: boolean;
  messageBrandingRequired: boolean;
};

export const CORE_PLAN_MATRIX = Object.fromEntries(CORE_PLAN_CODES.map((code) => {
  const plan = CANONICAL_SUBSCRIPTION_PLANS[code];
  const rule: CorePlanRule = {
    monthlyPriceTry: plan.monthlyPriceMinor / 100,
    yearlyPriceTry: plan.yearlyPriceMinor / 100,
    yearlyMonthlyEquivalentTry: plan.yearlyMonthlyEquivalentMinor / 100,
    totalUserSeats: plan.accountLimit,
    whatsappConnections: plan.whatsappConnectionLimit,
    groupMessaging: plan.features.groupMessaging,
    contactMessaging: plan.features.contactMessaging,
    scheduledMessaging: plan.features.scheduledMessaging,
    recurringMessaging: plan.features.recurringMessaging,
    deleteForEveryone: plan.features.deleteForEveryone,
    advancedSupport: plan.features.advancedSupport,
    advertisingEnabled: plan.features.advertisingEnabled,
    messageBrandingRequired: plan.features.brandingFooter,
  };
  return [code, rule];
})) as Record<CorePlanCode, CorePlanRule>;

export function isCorePlanCode(slug?: string | null): slug is CorePlanCode {
  return Boolean(slug && (CORE_PLAN_CODES as readonly string[]).includes(slug));
}

export function canonicalCorePlanCode(slug?: string | null): CorePlanCode | null {
  return canonicalSubscriptionPlanCode(slug);
}

export function corePlanRule(slug?: string | null) {
  const code = canonicalCorePlanCode(slug);
  return code ? CORE_PLAN_MATRIX[code] : null;
}
