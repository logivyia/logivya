import { create } from "zustand";

import {
  createMobileSupportTicket,
  createSupportOperationId,
  getMobileSupportTicket,
  getMobileSupportTickets,
  replyMobileSupportTicket,
  type MobileSupportTicket,
  type MobileTicketListItem
} from "@/api/mobileSupport";
import { translateCurrent } from "@/i18n/runtime";

type SupportState = {
  tickets: MobileTicketListItem[];
  selectedTicket: MobileSupportTicket | null;
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  error: string | null;
  success: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  pendingCreate: { fingerprint: string; id: string } | null;
  pendingReplies: Record<string, { body: string; id: string }>;
  messageNextCursor: string | null;
  hasOlderMessages: boolean;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  createTicket: (input: { subject: string; category: string; message: string }) => Promise<MobileSupportTicket | null>;
  loadTicket: (id: string) => Promise<void>;
  loadOlderMessages: (id: string) => Promise<void>;
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
  nextCursor: null,
  hasMore: false,
  pendingCreate: null,
  pendingReplies: {},
  messageNextCursor: null,
  hasOlderMessages: false,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileSupportTickets({ limit: 30 });
      set({ tickets: response.tickets, nextCursor: response.pageInfo.nextCursor, hasMore: response.pageInfo.hasMore, loading: false, refreshing: false });
    } catch (error) {
      set({ error: errorMessage(error, translateCurrent("supportTicketsLoadFailed")), loading: false, refreshing: false });
    }
  },
  loadMore: async () => {
    const { nextCursor, hasMore, loading } = get();
    if (!hasMore || !nextCursor || loading) return;
    set({ loading: true, error: null });
    try {
      const response = await getMobileSupportTickets({ cursor: nextCursor, limit: 30 });
      set((state) => ({
        tickets: [...state.tickets, ...response.tickets.filter((ticket) => !state.tickets.some((current) => current.id === ticket.id))],
        nextCursor: response.pageInfo.nextCursor,
        hasMore: response.pageInfo.hasMore,
        loading: false,
      }));
    } catch (error) {
      set({ error: errorMessage(error, translateCurrent("supportTicketsLoadFailed")), loading: false });
    }
  },
  refresh: async () => {
    set({ refreshing: true });
    await get().load();
  },
  createTicket: async (input) => {
    if (get().saving) return null;
    set({ saving: true, error: null, success: null });
    try {
      const fingerprint = `${input.subject}\n${input.category}\n${input.message}`;
      const pending = get().pendingCreate?.fingerprint === fingerprint
        ? get().pendingCreate!
        : { fingerprint, id: createSupportOperationId("ticket") };
      set({ pendingCreate: pending });
      const response = await createMobileSupportTicket({
        ...input,
        clientMessageId: pending.id,
        clientRequestId: pending.id,
      });
      set({ saving: false, success: translateCurrent("supportTicketCreated"), pendingCreate: null });
      await get().refresh();
      return response.ticket;
    } catch (error) {
      set({ saving: false, error: errorMessage(error, translateCurrent("supportTicketCreateFailed")) });
      return null;
    }
  },
  loadTicket: async (id) => {
    set((state) => ({
      loading: true,
      error: null,
      selectedTicket: state.selectedTicket && (state.selectedTicket.id === id || state.selectedTicket.publicId === id)
        ? state.selectedTicket
        : null,
    }));
    try {
      const response = await getMobileSupportTicket(id, { limit: 50 });
      set({ selectedTicket: response.ticket, messageNextCursor: response.pageInfo.nextCursor, hasOlderMessages: response.pageInfo.hasMore, loading: false });
    } catch (error) {
      set({ error: errorMessage(error, translateCurrent("supportTicketOpenFailed")), loading: false });
    }
  },
  loadOlderMessages: async (id) => {
    const { messageNextCursor, hasOlderMessages, loading, selectedTicket } = get();
    if (!messageNextCursor || !hasOlderMessages || loading || !selectedTicket) return;
    set({ loading: true, error: null });
    try {
      const response = await getMobileSupportTicket(id, { cursor: messageNextCursor, limit: 50 });
      set({
        selectedTicket: { ...selectedTicket, messages: [...response.messages, ...(selectedTicket.messages ?? [])] },
        messageNextCursor: response.pageInfo.nextCursor,
        hasOlderMessages: response.pageInfo.hasMore,
        loading: false,
      });
    } catch (error) {
      set({ error: errorMessage(error, translateCurrent("supportTicketOpenFailed")), loading: false });
    }
  },
  reply: async (id, message) => {
    if (get().saving) return false;
    set({ saving: true, error: null, success: null });
    try {
      const current = get().pendingReplies[id];
      const pending = current?.body === message ? current : { body: message, id: createSupportOperationId("reply") };
      set((state) => ({ pendingReplies: { ...state.pendingReplies, [id]: pending } }));
      await replyMobileSupportTicket(id, { message, clientMessageId: pending.id });
      await get().loadTicket(id);
      set((state) => {
        const pendingReplies = { ...state.pendingReplies };
        delete pendingReplies[id];
        return { saving: false, success: translateCurrent("replySent"), pendingReplies };
      });
      return true;
    } catch (error) {
      set({ saving: false, error: errorMessage(error, translateCurrent("replyFailed")) });
      return false;
    }
  },
  reset: () => set({ tickets: [], selectedTicket: null, loading: false, refreshing: false, saving: false, error: null, success: null, nextCursor: null, hasMore: false, pendingCreate: null, pendingReplies: {}, messageNextCursor: null, hasOlderMessages: false }),
  clearFeedback: () => set({ error: null, success: null })
}));
