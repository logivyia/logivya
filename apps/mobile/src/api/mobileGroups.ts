import { apiClient } from "@/api/client";

export type MobileGroupCategory = {
  category: {
    id: string;
    name: string;
    color: string | null;
  };
};

export type MobileGroup = {
  id: string;
  accountId: string;
  name: string;
  description: string | null;
  participantCount: number | null;
  canSend: boolean;
  lastSyncedAt: string | null;
  categories: MobileGroupCategory[];
};

export type MobileGroupsPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
};

export function getMobileGroups(params?: { q?: string; cursor?: string; limit?: number }) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.limit) search.set("limit", String(params.limit));

  const query = search.toString();
  return apiClient.request<{ groups: MobileGroup[]; pageInfo: MobileGroupsPageInfo }>(`/api/mobile/groups${query ? `?${query}` : ""}`);
}
