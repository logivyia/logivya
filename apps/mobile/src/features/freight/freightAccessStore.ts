import { create } from "zustand";

import { getFreightAccess, type FreightAccessAudience } from "@/api/mobileFreight";
import { useAuthStore } from "@/auth/auth-store";

type FreightAccessState = {
  status: "idle" | "loading" | "ready";
  checkedUserId: string | null;
  enabled: boolean;
  audience: FreightAccessAudience;
  load: (userId: string, force?: boolean) => Promise<void>;
  reset: () => void;
};

export const useFreightAccessStore = create<FreightAccessState>((set, get) => ({
  status: "idle",
  checkedUserId: null,
  enabled: false,
  audience: null,
  load: async (userId, force = false) => {
    const current = get();
    if (!force && current.checkedUserId === userId && (current.status === "loading" || current.status === "ready")) return;
    set({ status: "loading", checkedUserId: userId, enabled: false, audience: null });
    try {
      const result = await getFreightAccess();
      if (get().checkedUserId !== userId) return;
      set({ status: "ready", enabled: result.enabled === true, audience: result.enabled ? result.audience : null });
    } catch {
      if (get().checkedUserId !== userId) return;
      set({ status: "ready", enabled: false, audience: null });
    }
  },
  reset: () => set({ status: "idle", checkedUserId: null, enabled: false, audience: null }),
}));

export function useFreightAccessEnabled() {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isPlatformAdmin = useAuthStore((state) => state.isPlatformAdmin);
  return useFreightAccessStore((state) => (
    Boolean(userId)
    && (
      isPlatformAdmin
      || (
        state.status === "ready"
        && state.checkedUserId === userId
        && state.enabled
      )
    )
  ));
}
