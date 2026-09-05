import { apiClient } from "@/api/client";

export type ProductFeatureStatus = "INTERNAL" | "BETA" | "PUBLIC" | "COMING_SOON" | "DISABLED";
export type ProductFeatureKey =
  | "WHATSAPP_ACCOUNTS"
  | "TELEGRAM_ACCOUNTS"
  | "FACEBOOK_PAGES"
  | "GENERAL_MARKETPLACE"
  | "LIVE_LISTINGS"
  | "SAVED_DEMANDS"
  | "INTELLIGENT_MATCHING"
  | "HOME_MOVING"
  | "PARTIAL_LOAD"
  | "HEAVY_HAUL"
  | "IMAGE_SENDING"
  | "DOCUMENT_SENDING"
  | "VIDEO_SENDING"
  | "WHATSAPP_LISTING_INGESTION"
  | "TELEGRAM_LISTING_INGESTION"
  | "SOCIAL_PUBLISHING";

export type MobileProductFeatures = {
  version: string;
  updatedAt: string;
  features: Array<{ key: ProductFeatureKey; status: ProductFeatureStatus; providerBlocked: boolean }>;
};

export function getMobileProductFeatures() {
  return apiClient.request<MobileProductFeatures>("/api/mobile/product/features", { retry: false });
}
