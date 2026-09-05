import { create } from "zustand";
export const useGuestStore = create<{ authScreen: "Login" | "Register" | null; authenticate: (screen?: "Login" | "Register") => void; browse: () => void }>((set) => ({
  authScreen: null, authenticate: (authScreen = "Login") => set({ authScreen }), browse: () => set({ authScreen: null }),
}));
