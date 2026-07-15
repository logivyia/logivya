import { create } from "zustand";

import {
  getMobileSubscription,
  requestMobileSubscriptionUpgrade,
  resendMobileEmailVerification,
  type MobileCompanyEntitlementSummary,
  type MobileSubscription,
} from "@/api/mobileSubscription";
import { translateCurrent } from "@/i18n/runtime";

type SubscriptionState = {
  subscription: MobileSubscription | null;
  entitlements: MobileCompanyEntitlementSummary | null;
  loading: boolean;
  requesting: boolean;
  resendingVerification: boolean;
  error: string | null;
  success: string | null;
  load: () => Promise<void>;
  requestUpgrade: () => Promise<boolean>;
  resendVerification: () => Promise<boolean>;
  reset: () => void;
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  entitlements: null,
  loading: false,
  requesting: false,
  resendingVerification: false,
  error: null,
  success: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileSubscription();
      set({ subscription: response.subscription, entitlements: response.entitlements, loading: false });
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
  resendVerification: async () => {
    set({ resendingVerification: true, error: null, success: null });
    try {
      const response = await resendMobileEmailVerification();
      set({
        resendingVerification: false,
        success: response.alreadyVerified ? translateCurrent("emailAlreadyVerified") : translateCurrent("verificationEmailSent"),
      });
      await get().load();
      return true;
    } catch (error) {
      set({ resendingVerification: false, error: error instanceof Error ? error.message : translateCurrent("operationFailedError") });
      return false;
    }
  },
  reset: () => set({ subscription: null, entitlements: null, loading: false, requesting: false, resendingVerification: false, error: null, success: null })
}));
