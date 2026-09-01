import "server-only";

import {
  DEFAULT_PRODUCT_FEATURE_STATUS,
  PRODUCT_FEATURE_KEYS,
  PRODUCT_FEATURE_STATUSES,
  PROVIDER_GATED_FEATURES,
  type ProductFeatureKey,
  type ProductFeatureStatusValue,
} from "@/config/product-content";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import type { LogisticsSectorClassification, MarketplaceScope } from "@prisma/client";

export type ResolvedProductFeature = {
  key: ProductFeatureKey;
  status: ProductFeatureStatusValue;
  providerBlocked: boolean;
  blockerCode: string | null;
  source: "DATABASE" | "ENVIRONMENT" | "DEFAULT";
};

function environmentStatus(key: ProductFeatureKey) {
  const value = process.env[`PRODUCT_FEATURE_STATUS_${key}`]?.trim().toUpperCase();
  return PRODUCT_FEATURE_STATUSES.includes(value as ProductFeatureStatusValue)
    ? value as ProductFeatureStatusValue
    : null;
}

function providerConfigurationBlock(key: ProductFeatureKey) {
  if (!PROVIDER_GATED_FEATURES.has(key)) return null;
  if (key === "FACEBOOK_PAGES" || key === "SOCIAL_PUBLISHING") {
    return process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim()
      ? null
      : "META_CONFIGURATION_INCOMPLETE";
  }
  return null;
}

export async function resolveProductFeature(key: ProductFeatureKey): Promise<ResolvedProductFeature> {
  const fromEnvironment = environmentStatus(key);
  let status = fromEnvironment ?? DEFAULT_PRODUCT_FEATURE_STATUS[key];
  let source: ResolvedProductFeature["source"] = fromEnvironment ? "ENVIRONMENT" : "DEFAULT";
  let providerBlocked = false;
  let blockerCode: string | null = null;

  try {
    const configured = await prisma.productFeaturePublication.findUnique({
      where: { key },
      select: { status: true, providerBlocked: true, blockerCode: true },
    });
    if (configured) {
      status = configured.status;
      providerBlocked = configured.providerBlocked;
      blockerCode = configured.blockerCode;
      source = "DATABASE";
    }
  } catch (error) {
    logger.warn("product_feature.status_resolution_failed", { key, error });
  }

  const providerBlock = providerConfigurationBlock(key);
  if (providerBlock || providerBlocked) {
    return {
      key,
      status: status === "DISABLED" ? "DISABLED" : "INTERNAL",
      providerBlocked: true,
      blockerCode: blockerCode || providerBlock,
      source,
    };
  }

  return { key, status, providerBlocked, blockerCode, source };
}

export async function resolveAllProductFeatures() {
  const values = await Promise.all(PRODUCT_FEATURE_KEYS.map((key) => resolveProductFeature(key)));
  return Object.fromEntries(values.map((value) => [value.key, value])) as Record<ProductFeatureKey, ResolvedProductFeature>;
}

export async function requireProductFeature(key: ProductFeatureKey, allowed: readonly ProductFeatureStatusValue[] = ["PUBLIC", "BETA"]) {
  const feature = await resolveProductFeature(key);
  if (!allowed.includes(feature.status)) throw new Error("FEATURE_NOT_AVAILABLE");
  return feature;
}

export function productFeatureForMarketplaceScope(scope: MarketplaceScope): ProductFeatureKey {
  if (scope === "HOME_MOVING") return "HOME_MOVING";
  if (scope === "PARTIAL_LOAD") return "PARTIAL_LOAD";
  if (scope === "HEAVY_HAUL") return "HEAVY_HAUL";
  return "GENERAL_MARKETPLACE";
}

export async function requireMarketplaceScopeFeature(scope: MarketplaceScope) {
  return requireProductFeature(productFeatureForMarketplaceScope(scope));
}

export async function requireMarketplaceSectorFeature(sector: LogisticsSectorClassification) {
  if (sector === "HOME_MOVING" || sector === "PARTIAL_LOAD" || sector === "HEAVY_HAUL") {
    return requireMarketplaceScopeFeature(sector);
  }
  return requireProductFeature("GENERAL_MARKETPLACE");
}
