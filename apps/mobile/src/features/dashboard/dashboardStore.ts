import { create } from "zustand";

import { getMobileBootstrap, getMobileMessageHistory, type MobileBootstrap } from "@/api/mobileDashboard";
import { translateCurrent } from "@/i18n/runtime";

type DashboardMetrics = {
  accountCount: number;
  contactCount: number;
  groupCount: number;
  activeCampaigns: number;
  sentThisMonth: number;
  failedMessages: number;
};

type DashboardState = {
  data: MobileBootstrap | null;
  metrics: DashboardMetrics;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
};

const emptyMetrics: DashboardMetrics = {
  accountCount: 0,
  contactCount: 0,
  groupCount: 0,
  activeCampaigns: 0,
  sentThisMonth: 0,
  failedMessages: 0
};

function isThisMonth(dateValue: string) {
  const date = new Date(dateValue);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  data: null,
  metrics: emptyMetrics,
  loading: false,
  refreshing: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const [bootstrap, history] = await Promise.all([getMobileBootstrap(), getMobileMessageHistory()]);
      const accountCount = bootstrap.whatsapp.accounts.length;
      const contactCount = bootstrap.whatsapp.accounts.reduce((total, account) => total + account.contactCount, 0);
      const groupCount = bootstrap.whatsapp.accounts.reduce((total, account) => total + account.groupCount, 0);
      const monthlyCampaigns = history.campaigns.filter((campaign) => isThisMonth(campaign.createdAt));
      const activeCampaigns = history.campaigns.filter((campaign) => !["COMPLETED", "FAILED", "CANCELLED", "CANCELED"].includes(campaign.status)).length;
      const sentThisMonth = monthlyCampaigns.reduce((total, campaign) => total + campaign.sentCount, 0);
      const failedMessages = monthlyCampaigns.reduce((total, campaign) => total + campaign.failedCount, 0);

      set({
        data: bootstrap,
        metrics: { accountCount, contactCount, groupCount, activeCampaigns, sentThisMonth, failedMessages },
        loading: false,
        refreshing: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : translateCurrent("dashboardLoadFailed"),
        loading: false,
        refreshing: false
      });
    }
  },
  refresh: async () => {
    set({ refreshing: true });
    await get().load();
  },
  reset: () => set({ data: null, metrics: emptyMetrics, loading: false, refreshing: false, error: null })
}));
