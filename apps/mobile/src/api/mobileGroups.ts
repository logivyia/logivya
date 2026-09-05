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
  externalGroupId: string;
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

const MOBILE_GROUP_PAGE_SIZE = 100;
const MOBILE_GROUP_MAX_PAGES = 20;

export async function getAllMobileGroups(params?: { q?: string }) {
  const groups: MobileGroup[] = [];
  const seenGroupIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MOBILE_GROUP_MAX_PAGES; page += 1) {
    const response = await getMobileGroups({
      limit: MOBILE_GROUP_PAGE_SIZE,
      ...(params?.q ? { q: params.q } : {}),
      ...(cursor ? { cursor } : {}),
    });
    for (const group of response.groups) {
      if (seenGroupIds.has(group.id)) continue;
      seenGroupIds.add(group.id);
      groups.push(group);
    }
    if (!response.pageInfo.hasMore) {
      return {
        groups,
        pageInfo: { nextCursor: null, hasMore: false } satisfies MobileGroupsPageInfo,
      };
    }

    const nextCursor = response.pageInfo.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("GROUP_PAGINATION_INVALID");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error("GROUP_PAGINATION_LIMIT_EXCEEDED");
}

export function syncCurrentMobileGroups(accountId?: string) {
  return apiClient.post<{
    message: string;
    accountId: string;
    jobId: string | null;
    accountIds: string[];
    jobIds: string[];
    completedAccountIds: string[];
    groupCount: number;
  }>("/api/mobile/groups/sync-current", { accountId });
}
