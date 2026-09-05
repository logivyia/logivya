import { create } from "zustand";

import { getMobileProductFeatures, type ProductFeatureKey, type ProductFeatureStatus } from "@/api/mobileProductFeatures";

type ProductFeatureState = {
  status: "idle" | "loading" | "ready";
  features: Partial<Record<ProductFeatureKey, ProductFeatureStatus>>;
  load: (force?: boolean) => Promise<void>;
};

export const useProductFeatureStore = create<ProductFeatureState>((set, get) => ({
  status: "idle",
  features: {},
  load: async (force = false) => {
    if (!force && (get().status === "loading" || get().status === "ready")) return;
    set({ status: "loading" });
    try {
      const result = await getMobileProductFeatures();
      set({
        status: "ready",
        features: Object.fromEntries(result.features.map((feature) => [feature.key, feature.status])),
      });
    } catch {
      set({ status: "ready", features: {} });
    }
  },
}));

export function useProductFeatureVisible(key: ProductFeatureKey) {
  return useProductFeatureStore((state) => {
    const status = state.features[key];
    return status === "PUBLIC" || status === "BETA" || status === "COMING_SOON";
  });
}

export function useProductFeatureStatus(key: ProductFeatureKey) {
  return useProductFeatureStore((state) => state.features[key]);
}
