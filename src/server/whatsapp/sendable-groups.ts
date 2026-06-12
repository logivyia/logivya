import { prisma } from "@/server/db";

export async function resolveSendableWhatsAppGroups(companyId: string, requestedIds: string[]) {
  if (!requestedIds.length) return [];

  const requestedGroups = await prisma.whatsAppGroup.findMany({
    where: { companyId, id: { in: requestedIds } },
    select: { externalGroupId: true, account: { select: { phoneNumber: true } } },
  });
  if (!requestedGroups.length) return [];

  const externalGroupIds = [...new Set(requestedGroups.map((group) => group.externalGroupId))];
  const activeGroups = await prisma.whatsAppGroup.findMany({
    where: {
      companyId,
      externalGroupId: { in: externalGroupIds },
      isArchived: false,
      canSend: true,
      account: { archivedAt: null, status: "CONNECTED" },
    },
    include: { account: { select: { phoneNumber: true } } },
  });

  const byPhoneAndExternalId = new Map(activeGroups.map((group) => [`${group.account.phoneNumber || ""}:${group.externalGroupId}`, group]));
  const byExternalId = new Map(activeGroups.map((group) => [group.externalGroupId, group]));
  const resolved = requestedGroups
    .map((group) => byPhoneAndExternalId.get(`${group.account.phoneNumber || ""}:${group.externalGroupId}`) || byExternalId.get(group.externalGroupId))
    .filter((group): group is NonNullable<typeof group> => Boolean(group));

  return [...new Map(resolved.map((group) => [group.id, group])).values()];
}
