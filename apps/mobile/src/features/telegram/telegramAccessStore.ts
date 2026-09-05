import { create } from "zustand";

import { getTelegramAccess } from "@/api/mobileTelegram";
import { useAuthStore } from "@/auth/auth-store";

type TelegramAccessState = {
  status: "idle" | "loading" | "ready";
  checkedUserId: string | null;
  enabled: boolean;
  load: (userId: string, force?: boolean) => Promise<void>;
  reset: () => void;
};

export const useTelegramAccessStore = create<TelegramAccessState>((set, get) => ({
  status: "idle",
  checkedUserId: null,
  enabled: false,
  load: async (userId, force = false) => {
    const current = get();
    if (!force && current.checkedUserId === userId && (current.status === "loading" || current.status === "ready")) return;
    set({ status: "loading", checkedUserId: userId, enabled: false });
    try {
      const result = await getTelegramAccess();
      if (get().checkedUserId !== userId) return;
      set({ status: "ready", enabled: result.enabled === true });
    } catch {
      if (get().checkedUserId !== userId) return;
      set({ status: "ready", enabled: false });
    }
  },
  reset: () => set({ status: "idle", checkedUserId: null, enabled: false }),
}));

export function useTelegramAccessEnabled() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return useTelegramAccessStore((state) => Boolean(userId) && state.status === "ready" && state.checkedUserId === userId && state.enabled);
}

