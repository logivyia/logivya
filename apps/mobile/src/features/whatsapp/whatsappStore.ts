import { create } from "zustand";

import {
  archiveMobileWhatsAppAccount,
  deleteMobileWhatsAppAccount,
  getMobileWhatsAppAccounts,
  reconnectMobileWhatsAppAccount,
  type MobileWhatsAppAccount
} from "@/api/mobileWhatsApp";

type WhatsAppState = {
  accounts: MobileWhatsAppAccount[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  reconnect: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
};

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  accounts: [],
  loading: false,
  refreshing: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileWhatsAppAccounts();
      set({ accounts: response.accounts, loading: false, refreshing: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "WhatsApp hesapları yüklenemedi.",
        loading: false,
        refreshing: false
      });
    }
  },
  refresh: async () => {
    set({ refreshing: true });
    await get().load();
  },
  reconnect: async (id) => {
    await reconnectMobileWhatsAppAccount(id);
    await get().refresh();
  },
  archive: async (id) => {
    await archiveMobileWhatsAppAccount(id);
    await get().refresh();
  },
  remove: async (id) => {
    await deleteMobileWhatsAppAccount(id);
    await get().refresh();
  },
  reset: () => set({ accounts: [], loading: false, refreshing: false, error: null })
}));
