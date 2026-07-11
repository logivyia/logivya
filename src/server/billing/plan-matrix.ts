export const CORE_PLAN_CODES = ["trial", "starter", "professional"] as const;
export const PURCHASABLE_PLAN_CODES = ["starter", "professional"] as const;

export type CorePlanCode = (typeof CORE_PLAN_CODES)[number];
export type PurchasablePlanCode = (typeof PURCHASABLE_PLAN_CODES)[number];

export type CorePlanRule = {
  monthlyPriceTry: number;
  totalUserSeats: number;
  groupMessaging: boolean;
  contactMessaging: boolean;
  scheduledMessaging: boolean;
  recurringMessaging: boolean;
  deleteForEveryone: boolean;
  advancedSupport: boolean;
  advertisingEnabled: boolean;
};

export const CORE_PLAN_MATRIX: Record<CorePlanCode, CorePlanRule> = {
  trial: {
    monthlyPriceTry: 0,
    totalUserSeats: 1,
    groupMessaging: true,
    contactMessaging: true,
    scheduledMessaging: true,
    recurringMessaging: true,
    deleteForEveryone: true,
    advancedSupport: true,
    advertisingEnabled: true,
  },
  starter: {
    monthlyPriceTry: 280,
    totalUserSeats: 2,
    groupMessaging: true,
    contactMessaging: false,
    scheduledMessaging: true,
    recurringMessaging: true,
    deleteForEveryone: true,
    advancedSupport: true,
    advertisingEnabled: true,
  },
  professional: {
    monthlyPriceTry: 380,
    totalUserSeats: 3,
    groupMessaging: true,
    contactMessaging: true,
    scheduledMessaging: true,
    recurringMessaging: true,
    deleteForEveryone: true,
    advancedSupport: true,
    advertisingEnabled: false,
  },
};

export function isCorePlanCode(slug?: string | null): slug is CorePlanCode {
  return Boolean(slug && (CORE_PLAN_CODES as readonly string[]).includes(slug));
}

export function corePlanRule(slug?: string | null) {
  return isCorePlanCode(slug) ? CORE_PLAN_MATRIX[slug] : null;
}
