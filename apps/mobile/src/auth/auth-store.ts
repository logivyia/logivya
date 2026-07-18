import { create } from "zustand";

import type { AuthTokens, MobileCompany, MobileUser } from "@/types/api";

type AuthStatus = "booting" | "recovering" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  user: MobileUser | null;
  company: MobileCompany | null;
  permissions: string[];
  isPlatformAdmin: boolean;
  tokens: AuthTokens | null;
  setBooting: () => void;
  setRecovering: () => void;
  setSession: (session: {
    user: MobileUser;
    company: MobileCompany;
    permissions: string[];
    isAdmin?: boolean;
    isPlatformAdmin?: boolean;
    tokens: AuthTokens;
  }) => void;
  setCompany: (company: MobileCompany) => void;
  setTokens: (tokens: AuthTokens) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "booting",
  user: null,
  company: null,
  permissions: [],
  isPlatformAdmin: false,
  tokens: null,
  setBooting: () => set({ status: "booting" }),
  setRecovering: () => set({ status: "recovering" }),
  setSession: (session) =>
    set({
      status: "authenticated",
      user: session.user,
      company: session.company,
      permissions: session.permissions,
      isPlatformAdmin: session.isAdmin === true || session.isPlatformAdmin === true || session.user.isAdmin === true || session.user.isPlatformAdmin === true,
      tokens: session.tokens
    }),
  setCompany: (company) => set({ company }),
  setTokens: (tokens) => set({ tokens }),
  clearSession: () =>
    set({
      status: "unauthenticated",
      user: null,
      company: null,
      permissions: [],
      isPlatformAdmin: false,
      tokens: null
    })
}));
