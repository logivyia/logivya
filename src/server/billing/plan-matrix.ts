export type CorePlanCode = "trial" | "starter" | "professional";

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

export function corePlanRule(slug?: string | null) {
  return slug && slug in CORE_PLAN_MATRIX ? CORE_PLAN_MATRIX[slug as CorePlanCode] : null;
}
