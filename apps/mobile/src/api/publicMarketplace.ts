import { apiClient } from "./client";
export type PublicCatalogListing = {
  id: string; kind: "LOAD" | "VEHICLE" | "DRIVER"; href: string; publicTitle: string; publicDescription: string | null;
  loadingDisplayName: string | null; deliveryDisplayName: string | null; vehicleDisplayName: string | null;
  tonnageDisplay: string | null; tonnageAccessibilityLabel: string | null; vehicleCountDisplay: string | null;
  publicAdvertiserName: string; sourcePlatformDisplay: string; updatedAt: string; publishedAt: string;
};
export function getPublicCatalog(query: string) { return apiClient.request<{ items: PublicCatalogListing[]; nextCursor: string | null }>(`/api/public/marketplace?${query}`, { auth: false, retry: false }); }
export function getPublicCatalogDetail(kind: string, id: string) { return apiClient.request<{ listing: PublicCatalogListing & { attributes: Record<string, unknown> } }>(`/api/public/marketplace?kind=${kind.toLowerCase()}&id=${encodeURIComponent(id)}`, { auth: false, retry: false }); }
