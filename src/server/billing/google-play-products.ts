import { corePlanRule } from "@/server/billing/plan-matrix";

export const GOOGLE_PLAY_PACKAGE_NAME = "com.logivya.mobile";

export const GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS = {
  logivya_starter: {
    planSlug: "starter",
    basePlans: {
      monthly: "MONTHLY",
      yearly: "YEARLY",
    },
  },
  logivya_professional: {
    planSlug: "professional",
    basePlans: {
      monthly: "MONTHLY",
      yearly: "YEARLY",
    },
  },
} as const;

export type GooglePlaySubscriptionProductId =
  keyof typeof GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS;

export function googlePlaySubscriptionProduct(productId?: string | null) {
  if (!productId || !(productId in GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS))
    return null;
  return GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS[
    productId as GooglePlaySubscriptionProductId
  ];
}

export function googlePlaySubscriptionProductIds() {
  return Object.keys(
    GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS,
  ) as GooglePlaySubscriptionProductId[];
}

export function googlePlaySubscriptionOffer(
  productId?: string | null,
  basePlanId?: string | null,
) {
  const product = googlePlaySubscriptionProduct(productId);
  if (!product || !basePlanId || !(basePlanId in product.basePlans))
    return null;
  const billingPeriod =
    product.basePlans[basePlanId as keyof typeof product.basePlans];
  const rule = corePlanRule(product.planSlug);
  if (!rule) return null;
  return {
    productId: productId as GooglePlaySubscriptionProductId,
    basePlanId,
    planSlug: product.planSlug,
    billingPeriod,
    priceTry:
      billingPeriod === "YEARLY" ? rule.yearlyPriceTry : rule.monthlyPriceTry,
  } as const;
}
