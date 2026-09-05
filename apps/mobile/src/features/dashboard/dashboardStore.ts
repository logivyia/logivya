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

function normalizeBootstrapDashboard(bootstrap: MobileBootstrap): MobileBootstrap {
  const accounts = bootstrap.whatsapp?.accounts ?? [];
  const reportedMetrics = bootstrap.dashboardMetrics as MobileBootstrap["dashboardMetrics"] | null | undefined;

  return {
    ...bootstrap,
    whatsapp: {
      connectedCount: bootstrap.whatsapp?.connectedCount ?? 0,
      accounts
    },
    dashboardMetrics: {
      whatsappAccountCount: reportedMetrics?.whatsappAccountCount ?? 0,
      connectedWhatsAppAccountCount:
        reportedMetrics?.connectedWhatsAppAccountCount ??
        bootstrap.whatsapp?.connectedCount ??
        0,
      syncedWhatsAppGroupCount: reportedMetrics?.syncedWhatsAppGroupCount ?? 0,
      contactCount: reportedMetrics?.contactCount ?? 0,
      showContacts: reportedMetrics?.showContacts ?? false
    }
  };
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
      const [bootstrapPayload, history] = await Promise.all([
        getMobileBootstrap(),
        getMobileMessageHistory().catch(() => ({
          campaigns: [],
          pageInfo: { nextCursor: null, hasMore: false }
        }))
      ]);
      const bootstrap = normalizeBootstrapDashboard(bootstrapPayload);
      const {
        whatsappAccountCount: accountCount,
        contactCount,
        syncedWhatsAppGroupCount: groupCount
      } = bootstrap.dashboardMetrics;
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
