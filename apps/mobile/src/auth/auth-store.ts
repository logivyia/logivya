import { create } from "zustand";

import type { AuthTokens, MobileCompany, MobileUser } from "@/types/api";

type AuthStatus = "booting" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  user: MobileUser | null;
  company: MobileCompany | null;
  permissions: string[];
  tokens: AuthTokens | null;
  setBooting: () => void;
  setSession: (session: {
    user: MobileUser;
    company: MobileCompany;
    permissions: string[];
    tokens: AuthTokens;
  }) => void;
  setTokens: (tokens: AuthTokens) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "booting",
  user: null,
  company: null,
  permissions: [],
  tokens: null,
  setBooting: () => set({ status: "booting" }),
  setSession: (session) =>
    set({
      status: "authenticated",
      user: session.user,
      company: session.company,
      permissions: session.permissions,
      tokens: session.tokens
    }),
  setTokens: (tokens) => set({ tokens }),
  clearSession: () =>
    set({
      status: "unauthenticated",
      user: null,
      company: null,
      permissions: [],
      tokens: null
    })
}));
