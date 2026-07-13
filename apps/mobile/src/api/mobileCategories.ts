import { apiClient } from "@/api/client";
import type { MobileWhatsAppContact } from "@/api/mobileContacts";

export type MobileCategory = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  _count?: {
    groups: number;
    contacts: number;
  };
  assignedGroupCount?: number;
  assignedContactCount?: number;
  totalTargetCount?: number;
};

export type MobileCategoryPayload = {
  name: string;
  description?: string | null | undefined;
  color?: string;
  groupIds?: string[];
  contactIds?: string[];
};

export type MobileCategoryContactsResponse = {
  category: Pick<MobileCategory, "id" | "name" | "color" | "description">;
  account: { id: string; phoneNumber: string | null; lastContactSyncAt: string | null };
  contacts: Array<MobileWhatsAppContact & { assigned: boolean }>;
  assignedContactIds: string[];
  assignedContactCount: number;
  pageInfo: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
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

export function getMobileCategoryContacts(id: string, params: { page?: number; limit?: number; search?: string } = {}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 50));
  if (params.search?.trim()) query.set("search", params.search.trim());
  return apiClient.request<MobileCategoryContactsResponse>(`/api/mobile/categories/${id}/contacts?${query.toString()}`);
}
