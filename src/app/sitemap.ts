import type { MetadataRoute } from "next";

import { PUBLIC_PRODUCT_PAGES } from "@/config/public-product-pages";
import { resolveAllProductFeatures } from "@/server/features/product-status";

const SITE_URL = "https://www.logivya.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const features = await resolveAllProductFeatures();
  const now = new Date();
  const productPages = PUBLIC_PRODUCT_PAGES.filter((page) => {
    if (!page.feature) return true;
    const status = features[page.feature].status;
    return status === "PUBLIC" || status === "BETA" || status === "COMING_SOON";
  }).map((page) => ({
    url: `${SITE_URL}/${page.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: page.slug === "canli-lojistik-pazari" ? 0.9 : 0.7,
  }));
  const legalPages = ["", "/privacy-policy", "/terms-of-service", "/cookie-policy", "/kvkk", "/data-processing-agreement", "/teslimat-ve-iade"]
    .map((path) => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency: "monthly" as const, priority: path ? 0.4 : 1 }));
  return [...legalPages, ...productPages];
}
