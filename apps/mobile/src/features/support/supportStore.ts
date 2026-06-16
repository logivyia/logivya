import { create } from "zustand";

import {
  createMobileSupportTicket,
  getMobileSupportTicket,
  getMobileSupportTickets,
  replyMobileSupportTicket,
  type MobileSupportTicket,
  type MobileTicketListItem
} from "@/api/mobileSupport";

type SupportState = {
  tickets: MobileTicketListItem[];
  selectedTicket: MobileSupportTicket | null;
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  createTicket: (input: { subject: string; type: string; message: string }) => Promise<MobileSupportTicket | null>;
  loadTicket: (id: string) => Promise<void>;
  reply: (id: string, message: string) => Promise<boolean>;
  reset: () => void;
  clearFeedback: () => void;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const useSupportStore = create<SupportState>((set, get) => ({
  tickets: [],
  selectedTicket: null,
  loading: false,
  refreshing: false,
  saving: false,
  error: null,
  success: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileSupportTickets({ limit: 30 });
      set({ tickets: response.tickets, loading: false, refreshing: false });
    } catch (error) {
      set({ error: errorMessage(error, "Destek talepleri yüklenemedi."), loading: false, refreshing: false });
    }
  },
  refresh: async () => {
    set({ refreshing: true });
    await get().load();
  },
  createTicket: async (input) => {
    set({ saving: true, error: null, success: null });
    try {
      const response = await createMobileSupportTicket(input);
      set({ saving: false, success: "Destek talebi oluşturuldu." });
      await get().refresh();
      return response.ticket;
    } catch (error) {
      set({ saving: false, error: errorMessage(error, "Destek talebi oluşturulamadı.") });
      return null;
    }
  },
  loadTicket: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileSupportTicket(id);
      set({ selectedTicket: response.ticket, loading: false });
    } catch (error) {
      set({ error: errorMessage(error, "Destek talebi açılmadı."), loading: false });
    }
  },
  reply: async (id, message) => {
    set({ saving: true, error: null, success: null });
    try {
      await replyMobileSupportTicket(id, message);
      await get().loadTicket(id);
      set({ saving: false, success: "Yanıt gönderildi." });
      return true;
    } catch (error) {
      set({ saving: false, error: errorMessage(error, "Yanıt gönderilemedi.") });
      return false;
    }
  },
  reset: () => set({ tickets: [], selectedTicket: null, loading: false, refreshing: false, saving: false, error: null, success: null }),
  clearFeedback: () => set({ error: null, success: null })
}));
