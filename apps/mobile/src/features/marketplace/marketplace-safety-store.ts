import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const STORAGE_KEY = "logivya.mobile.marketplace-safety.v1";
export const EMPTY_BLOCKED_OWNER_IDS: string[] = [];

type MarketplaceSafetyState = {
  blockedOwnerIdsByViewer: Record<string, string[]>;
  blockOwner: (viewerUserId: string, ownerUserId: string) => void;
  unblockOwner: (viewerUserId: string, ownerUserId: string) => void;
};

export const useMarketplaceSafetyStore = create<MarketplaceSafetyState>()(
  persist(
    (set) => ({
      blockedOwnerIdsByViewer: {},
      blockOwner: (viewerUserId, ownerUserId) =>
        set((state) => {
          const current = state.blockedOwnerIdsByViewer[viewerUserId] ?? [];
          if (current.includes(ownerUserId)) return state;
          return {
            blockedOwnerIdsByViewer: {
              ...state.blockedOwnerIdsByViewer,
              [viewerUserId]: [...current, ownerUserId],
            },
          };
        }),
      unblockOwner: (viewerUserId, ownerUserId) =>
        set((state) => ({
          blockedOwnerIdsByViewer: {
            ...state.blockedOwnerIdsByViewer,
            [viewerUserId]: (state.blockedOwnerIdsByViewer[viewerUserId] ?? []).filter(
              (id) => id !== ownerUserId,
            ),
          },
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ blockedOwnerIdsByViewer: state.blockedOwnerIdsByViewer }),
    },
  ),
);
