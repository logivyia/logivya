import { create } from "zustand";

import { getMobileSubscription, requestMobileSubscriptionUpgrade, type MobileSubscription } from "@/api/mobileSubscription";
import { translateCurrent } from "@/i18n/runtime";

type SubscriptionState = {
  subscription: MobileSubscription | null;
  loading: boolean;
  requesting: boolean;
  error: string | null;
  success: string | null;
  load: () => Promise<void>;
  requestUpgrade: () => Promise<boolean>;
  reset: () => void;
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  loading: false,
  requesting: false,
  error: null,
  success: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileSubscription();
      set({ subscription: response.subscription, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : translateCurrent("subscriptionLoadFailed"), loading: false });
    }
  },
  requestUpgrade: async () => {
    set({ requesting: true, error: null, success: null });
    try {
      const response = await requestMobileSubscriptionUpgrade({ planSlug: "professional", billingPeriod: "MONTHLY" });
      set({ requesting: false, success: response.message });
      await get().load();
      return true;
    } catch (error) {
      set({ requesting: false, error: error instanceof Error ? error.message : translateCurrent("subscriptionUpgradeFailed") });
      return false;
    }
  },
  reset: () => set({ subscription: null, loading: false, requesting: false, error: null, success: null })
}));
