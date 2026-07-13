import { create } from "zustand";

import { getMobileGroups, syncCurrentMobileGroups, type MobileGroup } from "@/api/mobileGroups";
import { translateCurrent } from "@/i18n/runtime";

type GroupFilters = {
  search: string;
  accountId: string | null;
  categoryId: string | null;
};

type GroupsState = {
  groups: MobileGroup[];
  filters: GroupFilters;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setSearch: (search: string) => void;
  setAccountFilter: (accountId: string | null) => void;
  setCategoryFilter: (categoryId: string | null) => void;
  clearFilters: () => void;
  reset: () => void;
};

const defaultFilters: GroupFilters = {
  search: "",
  accountId: null,
  categoryId: null
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  filters: defaultFilters,
  loading: false,
  refreshing: false,
  error: null,
  load: async () => {
    const search = get().filters.search.trim();
    set({ loading: true, error: null });
    try {
      const response = await getMobileGroups(search ? { q: search, limit: 100 } : { limit: 100 });
      set({ groups: response.groups, loading: false, refreshing: false });
    } catch (error) {
      set({
        error: getErrorMessage(error, translateCurrent("groupsLoadFailed")),
        loading: false,
        refreshing: false
      });
    }
  },
  refresh: async () => {
    set({ refreshing: true });
    try {
      await syncCurrentMobileGroups();
    } catch {
      // A stale or disconnected account should not block loading the scoped DB list.
    }
    await get().load();
  },
  setSearch: (search) => set((state) => ({ filters: { ...state.filters, search } })),
  setAccountFilter: (accountId) => set((state) => ({ filters: { ...state.filters, accountId } })),
  setCategoryFilter: (categoryId) => set((state) => ({ filters: { ...state.filters, categoryId } })),
  clearFilters: () => set({ filters: defaultFilters }),
  reset: () => set({ groups: [], filters: defaultFilters, loading: false, refreshing: false, error: null })
}));
