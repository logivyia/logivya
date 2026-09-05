export const APPLE_APP_BUNDLE_ID = "com.logivya.mobile";
export const APPLE_APP_ID = 6792539737;

export const APPLE_SUBSCRIPTION_PRODUCTS = {
  "com.logivya.mobile.starter.monthly": {
    planSlug: "starter",
    billingPeriod: "MONTHLY",
  },
  "com.logivya.mobile.starter.yearly": {
    planSlug: "starter",
    billingPeriod: "YEARLY",
  },
  "com.logivya.mobile.professional.monthly": {
    planSlug: "professional",
    billingPeriod: "MONTHLY",
  },
  "com.logivya.mobile.professional.yearly": {
    planSlug: "professional",
    billingPeriod: "YEARLY",
  },
} as const;

export type AppleSubscriptionProductId = keyof typeof APPLE_SUBSCRIPTION_PRODUCTS;

export function appleSubscriptionProduct(productId?: string | null) {
  if (!productId || !(productId in APPLE_SUBSCRIPTION_PRODUCTS)) return null;
  return APPLE_SUBSCRIPTION_PRODUCTS[productId as AppleSubscriptionProductId];
}

export function appleSubscriptionProductIds() {
  return Object.keys(APPLE_SUBSCRIPTION_PRODUCTS) as AppleSubscriptionProductId[];
}
