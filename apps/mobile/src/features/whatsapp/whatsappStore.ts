import { create } from "zustand";

import {
  archiveMobileWhatsAppAccount,
  createMobileWhatsAppPhoneCode,
  createMobileWhatsAppQrSession,
  deleteMobileWhatsAppAccount,
  getMobileWhatsAppAccounts,
  getMobileWhatsAppAccountStatus,
  reconnectMobileWhatsAppAccount,
  type MobileWhatsAppAccount
} from "@/api/mobileWhatsApp";

type ConnectionPhase = "idle" | "generating" | "ready" | "polling" | "connected" | "failed" | "expired";

type ConnectionState = {
  account: MobileWhatsAppAccount | null;
  phase: ConnectionPhase;
  error: string | null;
  polling: boolean;
};

type WhatsAppState = {
  accounts: MobileWhatsAppAccount[];
  selectedAccount: MobileWhatsAppAccount | null;
  qr: ConnectionState;
  phoneCode: ConnectionState & { normalizedPhone: string | null };
  loading: boolean;
  refreshing: boolean;
  actionLoadingId: string | null;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  generateQr: () => Promise<MobileWhatsAppAccount | null>;
  generatePhoneCode: (phoneNumber: string) => Promise<MobileWhatsAppAccount | null>;
  pollAccount: (accountId: string, mode: "qr" | "phoneCode") => Promise<MobileWhatsAppAccount | null>;
  reconnect: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  selectAccount: (account: MobileWhatsAppAccount | null) => void;
  resetConnection: (mode?: "qr" | "phoneCode") => void;
  reset: () => void;
};

const emptyConnection: ConnectionState = {
  account: null,
  phase: "idle",
  error: null,
  polling: false
};

function upsertAccount(accounts: MobileWhatsAppAccount[], account: MobileWhatsAppAccount) {
  const exists = accounts.some((item) => item.id === account.id);
  return exists ? accounts.map((item) => (item.id === account.id ? account : item)) : [account, ...accounts];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getConnectionPhase(account: MobileWhatsAppAccount, mode: "qr" | "phoneCode"): ConnectionPhase {
  if (account.status === "CONNECTED") return "connected";
  if (account.status === "FAILED") return "failed";

  const expiresAt = mode === "qr" ? account.qrExpiresAt : account.pairingCodeExpiresAt;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "expired";

  return "polling";
}

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  accounts: [],
  selectedAccount: null,
  qr: emptyConnection,
  phoneCode: { ...emptyConnection, normalizedPhone: null },
  loading: false,
  refreshing: false,
  actionLoadingId: null,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileWhatsAppAccounts();
      set({ accounts: response.accounts, loading: false, refreshing: false });
    } catch (error) {
      set({
        error: getErrorMessage(error, "WhatsApp hesapları yüklenemedi."),
        loading: false,
        refreshing: false
      });
    }
  },
  refresh: async () => {
    set({ refreshing: true });
    await get().load();
  },
  generateQr: async () => {
    set({ qr: { ...emptyConnection, phase: "generating" } });
    try {
      const response = await createMobileWhatsAppQrSession();
      const account = response.account;
      set((state) => ({
        accounts: upsertAccount(state.accounts, account),
        selectedAccount: account,
        qr: { account, phase: account.status === "CONNECTED" ? "connected" : "ready", error: null, polling: false }
      }));
      return account;
    } catch (error) {
      set({ qr: { ...emptyConnection, phase: "failed", error: getErrorMessage(error, "QR kod oluşturulamadı.") } });
      return null;
    }
  },
  generatePhoneCode: async (phoneNumber) => {
    set({ phoneCode: { ...emptyConnection, normalizedPhone: phoneNumber, phase: "generating" } });
    try {
      const response = await createMobileWhatsAppPhoneCode(phoneNumber);
      const account = response.account;
      set((state) => ({
        accounts: upsertAccount(state.accounts, account),
        selectedAccount: account,
        phoneCode: {
          account,
          normalizedPhone: account.phoneNumber ?? phoneNumber,
          phase: account.status === "CONNECTED" ? "connected" : "ready",
          error: null,
          polling: false
        }
      }));
      return account;
    } catch (error) {
      set({
        phoneCode: {
          ...emptyConnection,
          normalizedPhone: phoneNumber,
          phase: "failed",
          error: getErrorMessage(error, "Telefon kodu oluşturulamadı.")
        }
      });
      return null;
    }
  },
  pollAccount: async (accountId, mode) => {
    set((state) => ({
      [mode]: { ...state[mode], polling: true, phase: state[mode].phase === "idle" ? "polling" : state[mode].phase }
    }));
    try {
      const response = await getMobileWhatsAppAccountStatus(accountId);
      const account = response.account;
      const phase = getConnectionPhase(account, mode);

      set((state) => ({
        accounts: upsertAccount(state.accounts, account),
        selectedAccount: account,
        [mode]: {
          ...state[mode],
          account,
          phase,
          error: phase === "failed" ? account.lastError ?? "Bağlantı başarısız oldu." : null,
          polling: phase !== "connected" && phase !== "failed" && phase !== "expired"
        }
      }));

      if (phase === "connected") await get().refresh();
      return account;
    } catch (error) {
      set((state) => ({
        [mode]: {
          ...state[mode],
          phase: "failed",
          error: getErrorMessage(error, "Bağlantı durumu alınamadı."),
          polling: false
        }
      }));
      return null;
    }
  },
  reconnect: async (id) => {
    set({ actionLoadingId: id });
    try {
      await reconnectMobileWhatsAppAccount(id);
      await get().refresh();
    } finally {
      set({ actionLoadingId: null });
    }
  },
  archive: async (id) => {
    set({ actionLoadingId: id });
    try {
      await archiveMobileWhatsAppAccount(id);
      await get().refresh();
    } finally {
      set({ actionLoadingId: null });
    }
  },
  remove: async (id) => {
    set({ actionLoadingId: id });
    try {
      await deleteMobileWhatsAppAccount(id);
      await get().refresh();
    } finally {
      set({ actionLoadingId: null });
    }
  },
  selectAccount: (account) => set({ selectedAccount: account }),
  resetConnection: (mode) => {
    if (!mode || mode === "qr") set({ qr: emptyConnection });
    if (!mode || mode === "phoneCode") set({ phoneCode: { ...emptyConnection, normalizedPhone: null } });
  },
  reset: () =>
    set({
      accounts: [],
      selectedAccount: null,
      qr: emptyConnection,
      phoneCode: { ...emptyConnection, normalizedPhone: null },
      loading: false,
      refreshing: false,
      actionLoadingId: null,
      error: null
    })
}));
