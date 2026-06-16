import { create } from "zustand";

import { meRequest } from "@/api/auth-api";
import type { MobileCompany, MobileUser } from "@/types/api";

type ProfileState = {
  user: MobileUser | null;
  company: MobileCompany | null;
  role: string | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  reset: () => void;
};

export const useProfileStore = create<ProfileState>((set) => ({
  user: null,
  company: null,
  role: null,
  permissions: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await meRequest();
      set({ user: { ...response.user, role: response.role }, company: response.company, role: response.role, permissions: response.permissions, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Profil bilgisi alınamadı.", loading: false });
    }
  },
  reset: () => set({ user: null, company: null, role: null, permissions: [], loading: false, error: null })
}));
