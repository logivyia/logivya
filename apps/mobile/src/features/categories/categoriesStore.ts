import { create } from "zustand";

import {
  createMobileCategory,
  deleteMobileCategory,
  getMobileCategories,
  updateMobileCategory,
  type MobileCategory,
  type MobileCategoryPayload
} from "@/api/mobileCategories";
import { translateCurrent } from "@/i18n/runtime";

type CategoriesState = {
  categories: MobileCategory[];
  selectedCategory: MobileCategory | null;
  assignmentGroupIds: string[];
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  deletingId: string | null;
  error: string | null;
  success: string | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  createCategory: (payload: MobileCategoryPayload) => Promise<boolean>;
  updateCategory: (id: string, payload: Partial<MobileCategoryPayload>) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  selectCategory: (category: MobileCategory | null, groupIds?: string[]) => void;
  toggleAssignment: (groupId: string) => void;
  setAssignmentGroupIds: (groupIds: string[]) => void;
  clearFeedback: () => void;
  reset: () => void;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function upsertCategory(categories: MobileCategory[], category: MobileCategory) {
  return categories.some((item) => item.id === category.id) ? categories.map((item) => (item.id === category.id ? category : item)) : [category, ...categories];
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [],
  selectedCategory: null,
  assignmentGroupIds: [],
  loading: false,
  refreshing: false,
  saving: false,
  deletingId: null,
  error: null,
  success: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const response = await getMobileCategories();
      set({ categories: response.categories, loading: false, refreshing: false });
    } catch (error) {
      set({
        error: getErrorMessage(error, translateCurrent("categoriesLoadFailed")),
        loading: false,
        refreshing: false
      });
    }
  },
  refresh: async () => {
    set({ refreshing: true });
    await get().load();
  },
  createCategory: async (payload) => {
    set({ saving: true, error: null, success: null });
    try {
      const response = await createMobileCategory(payload);
      set((state) => ({
        categories: upsertCategory(state.categories, response.category),
        saving: false,
        success: translateCurrent("categoryCreated")
      }));
      await get().refresh();
      return true;
    } catch (error) {
      set({ saving: false, error: getErrorMessage(error, translateCurrent("categoryCreateFailed")) });
      return false;
    }
  },
  updateCategory: async (id, payload) => {
    set({ saving: true, error: null, success: null });
    try {
      const response = await updateMobileCategory(id, payload);
      set((state) => ({
        categories: upsertCategory(state.categories, response.category),
        selectedCategory: state.selectedCategory?.id === id ? response.category : state.selectedCategory,
        saving: false,
        success: translateCurrent("categoryUpdated")
      }));
      await get().refresh();
      return true;
    } catch (error) {
      set({ saving: false, error: getErrorMessage(error, translateCurrent("categoryUpdateFailed")) });
      return false;
    }
  },
  deleteCategory: async (id) => {
    set({ deletingId: id, error: null, success: null });
    try {
      await deleteMobileCategory(id);
      set((state) => ({
        categories: state.categories.filter((category) => category.id !== id),
        selectedCategory: state.selectedCategory?.id === id ? null : state.selectedCategory,
        deletingId: null,
        success: translateCurrent("categoryDeleted")
      }));
      return true;
    } catch (error) {
      set({ deletingId: null, error: getErrorMessage(error, translateCurrent("categoryDeleteFailed")) });
      return false;
    }
  },
  selectCategory: (category, groupIds = []) => set({ selectedCategory: category, assignmentGroupIds: groupIds, error: null, success: null }),
  toggleAssignment: (groupId) =>
    set((state) => ({
      assignmentGroupIds: state.assignmentGroupIds.includes(groupId)
        ? state.assignmentGroupIds.filter((id) => id !== groupId)
        : [...state.assignmentGroupIds, groupId]
    })),
  setAssignmentGroupIds: (groupIds) => set({ assignmentGroupIds: groupIds }),
  clearFeedback: () => set({ error: null, success: null }),
  reset: () =>
    set({
      categories: [],
      selectedCategory: null,
      assignmentGroupIds: [],
      loading: false,
      refreshing: false,
      saving: false,
      deletingId: null,
      error: null,
      success: null
    })
}));
