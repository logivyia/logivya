type GroupWithExternalId = {
  id: string;
  externalGroupId: string | null;
  canSend?: boolean | null;
  lastSyncedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  account?: {
    status?: string | null;
    archivedAt?: Date | string | null;
  } | null;
};

function timeValue(value: Date | string | null | undefined) {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function groupScore(group: GroupWithExternalId) {
  const status = group.account?.status;
  const connectedScore =
    status === "CONNECTED"
      ? 1_000_000_000_000_000
      : status === "CONNECTING" || status === "DISCONNECTED" || status === "RECONNECT_REQUIRED"
        ? 500_000_000_000_000
        : 0;
  const activeAccountScore = group.account?.archivedAt ? 0 : 100_000_000_000_000;
  const sendableScore = group.canSend ? 10_000_000_000_000 : 0;
  return connectedScore + activeAccountScore + sendableScore + Math.max(timeValue(group.lastSyncedAt), timeValue(group.updatedAt), timeValue(group.createdAt));
}

export function dedupeWhatsAppGroupsByExternalId<T extends GroupWithExternalId>(groups: readonly T[]) {
  const byExternalId = new Map<string, T>();
  const groupsWithoutExternalId: T[] = [];

  for (const group of groups) {
    const externalGroupId = group.externalGroupId?.trim();
    if (!externalGroupId) {
      groupsWithoutExternalId.push(group);
      continue;
    }

    const existing = byExternalId.get(externalGroupId);
    if (!existing || groupScore(group) > groupScore(existing)) {
      byExternalId.set(externalGroupId, group);
    }
  }

  return [...byExternalId.values(), ...groupsWithoutExternalId];
}
