import { create } from "zustand";

import { getFacebookPagesAccess } from "@/api/mobileFacebook";
import { useAuthStore } from "@/auth/auth-store";

type FacebookAccessState = {
  status: "idle" | "loading" | "ready";
  checkedUserId: string | null;
  enabled: boolean;
  configured: boolean;
  load: (userId: string, force?: boolean) => Promise<void>;
  reset: () => void;
};

export const useFacebookAccessStore = create<FacebookAccessState>((set, get) => ({
  status: "idle",
  checkedUserId: null,
  enabled: false,
  configured: false,
  load: async (userId, force = false) => {
    const current = get();
    if (!force && current.checkedUserId === userId && (current.status === "loading" || current.status === "ready")) return;
    set({ status: "loading", checkedUserId: userId, enabled: false, configured: false });
    try {
      const result = await getFacebookPagesAccess();
      if (get().checkedUserId !== userId) return;
      set({ status: "ready", enabled: result.enabled === true, configured: result.configured === true });
    } catch {
      if (get().checkedUserId !== userId) return;
      set({ status: "ready", enabled: false, configured: false });
    }
  },
  reset: () => set({ status: "idle", checkedUserId: null, enabled: false, configured: false }),
}));

export function useFacebookPagesEnabled() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return useFacebookAccessStore((state) => Boolean(userId) && state.status === "ready" && state.checkedUserId === userId && state.enabled);
}
