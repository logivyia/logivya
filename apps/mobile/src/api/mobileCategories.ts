import { apiClient } from "@/api/client";

export type MobileCategory = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  _count?: {
    groups: number;
  };
};

export type MobileCategoryPayload = {
  name: string;
  description?: string | null | undefined;
  color?: string;
  groupIds?: string[];
};

export function getMobileCategories() {
  return apiClient.request<{ categories: MobileCategory[] }>("/api/mobile/categories");
}

export function createMobileCategory(payload: MobileCategoryPayload) {
  return apiClient.post<{ category: MobileCategory }>("/api/mobile/categories", payload);
}

export function updateMobileCategory(id: string, payload: Partial<MobileCategoryPayload>) {
  return apiClient.patch<{ category: MobileCategory }>(`/api/mobile/categories/${id}`, payload);
}

export function deleteMobileCategory(id: string) {
  return apiClient.delete<{ archived: true }>(`/api/mobile/categories/${id}`);
}
