import { create } from "zustand";

import { getMobileSubscription, type MobileSubscription } from "@/api/mobileSubscription";

type SubscriptionState = {
  subscription: MobileSubscription | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  reset: () => void;
};

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileSubscription();
      set({ subscription: response.subscription, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Abonelik bilgisi alınamadı.", loading: false });
    }
  },
  reset: () => set({ subscription: null, loading: false, error: null })
}));
