import type { CatalogReturn } from "@/features/freight/catalog-return";
import { create } from "zustand";
type Destination = { id: string; kind: string; catalog?: CatalogReturn };
export const useGuestStore = create<{ authScreen: "Login" | "Register" | null; destination: Destination | null; setDestination: (value: Destination | null) => void; authenticate: (screen?: "Login" | "Register") => void; browse: () => void }>((set) => ({
  destination: null, setDestination: destination => set({ destination }),
  authScreen: null, authenticate: (authScreen = "Login") => set({ authScreen }), browse: () => set({ authScreen: null }),
}));
