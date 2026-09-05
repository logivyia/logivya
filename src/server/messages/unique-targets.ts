/** A selection is a union: overlapping categories never multiply deliveries. */
export function uniqueSelectedGroupIds(directIds: string[], categoryGroups: { groupId: string }[]) {
  return [...new Set([...directIds, ...categoryGroups.map((group) => group.groupId)])];
}

export function uniqueGroupDeliveryTargets<T extends { id: string; accountId: string; externalGroupId: string }>(groups: T[]): T[] {
  const targets = new Map<string, T>();
  for (const group of groups) {
    const externalId = group.externalGroupId.trim();
    if (!externalId) throw new Error("MESSAGE_TARGET_MISSING");
    const identity = JSON.stringify([group.accountId, externalId]);
    if (!targets.has(identity)) targets.set(identity, group);
  }
  return [...targets.values()];
}
