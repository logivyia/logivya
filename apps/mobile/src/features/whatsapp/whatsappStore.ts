import { create } from "zustand";

import {
  archiveMobileWhatsAppAccount,
  createMobileWhatsAppPhoneCode,
  createMobileWhatsAppQrSession,
  deleteMobileWhatsAppAccount,
  getMobileWhatsAppAccounts,
  getMobileWhatsAppAccountStatus,
  getMobileWhatsAppStatus,
  reconnectMobileWhatsAppAccount,
  type MobileWhatsAppAccount,
  type MobileWhatsAppUnifiedStatus
} from "@/api/mobileWhatsApp";
import { useAuthStore } from "@/auth/auth-store";
import { getWhatsAppUserMessage } from "@/features/whatsapp/whatsappStatus";
import { translateCurrent } from "@/i18n/runtime";
import { trackEvent } from "@/services/analytics";

type ConnectionPhase = "idle" | "generating" | "ready" | "polling" | "connected" | "failed" | "expired";
const WHATSAPP_ACCOUNTS_LOAD_TIMEOUT_MS = 20_000;

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
  loadAttempted: boolean;
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
  if (error instanceof Error && error.message === "WA_ACCOUNTS_UI_TIMEOUT") return translateCurrent("whatsappAccountsRetry");
  return error instanceof Error ? error.message : fallback;
}

function accountTelemetryContext() {
  const { user, company } = useAuthStore.getState();
  return {
    userId: user?.id,
    companyId: company?.id,
    role: user?.role,
    email: user?.email
  };
}

function statusFromAccounts(accounts: MobileWhatsAppAccount[]): MobileWhatsAppUnifiedStatus {
  return {
    connectedCount: accounts.filter((account) => account.status === "CONNECTED").length,
    reconnectingCount: accounts.filter((account) => ["CONNECTING", "RECONNECTING", "DEGRADED"].includes(account.status)).length,
    healthyCount: accounts.filter((account) => account.healthScore >= 70).length,
    totalGroupCount: accounts.reduce((sum, account) => sum + account.groupCount, 0),
    accounts
  };
}

async function withAccountsLoadTimeout<T>(promise: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("WA_ACCOUNTS_UI_TIMEOUT")), WHATSAPP_ACCOUNTS_LOAD_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
  loadAttempted: false,
  actionLoadingId: null,
  error: null,
  load: async () => {
    if (get().loading) return;
    const startedAt = Date.now();
    const telemetry = accountTelemetryContext();
    set({ loading: true, error: null, loadAttempted: true });
    void trackEvent("WA_ACCOUNTS_REQUEST_START", telemetry);
    try {
      const response = await withAccountsLoadTimeout(
        getMobileWhatsAppStatus().catch(() => getMobileWhatsAppAccounts().then((fallback) => ({ status: statusFromAccounts(fallback.accounts) })))
      );
      const accounts = response.status.accounts;
      set({ accounts, loading: false, refreshing: false, error: null, loadAttempted: true });
      void trackEvent(accounts.length ? "WA_ACCOUNTS_REQUEST_SUCCESS" : "WA_ACCOUNTS_REQUEST_EMPTY", {
        ...telemetry,
        accountCount: accounts.length,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      const message = getErrorMessage(error, translateCurrent("whatsappAccountsLoadFailed"));
      const code = error instanceof Error ? error.message : "UNKNOWN";
      const eventName = code === "WA_ACCOUNTS_UI_TIMEOUT" ? "WA_ACCOUNTS_UI_TIMEOUT" : "WA_ACCOUNTS_REQUEST_ERROR";
      void trackEvent(eventName, { ...telemetry, error: code, durationMs: Date.now() - startedAt });
      set({
        error: message,
        loading: false,
        refreshing: false,
        loadAttempted: true
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
      set({ qr: { ...emptyConnection, phase: "failed", error: getErrorMessage(error, translateCurrent("whatsappQrCreateFailed")) } });
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
          error: getErrorMessage(error, translateCurrent("whatsappPhoneCodeCreateFailed"))
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
          error: phase === "failed" ? getWhatsAppUserMessage(account) ?? translateCurrent("whatsappConnectionFailed") : null,
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
          error: getErrorMessage(error, translateCurrent("whatsappStatusLoadFailed")),
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
      loadAttempted: false,
      actionLoadingId: null,
      error: null
    })
}));
