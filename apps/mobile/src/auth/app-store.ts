import { create } from "zustand";

type AppState = {
  isOnline: boolean;
  isRefreshingSession: boolean;
  setOnline: (isOnline: boolean) => void;
  setRefreshingSession: (isRefreshingSession: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  isOnline: true,
  isRefreshingSession: false,
  setOnline: (isOnline) => set({ isOnline }),
  setRefreshingSession: (isRefreshingSession) => set({ isRefreshingSession })
}));
