import { prisma } from "@/server/db";
import { isRecoverableWhatsAppStatus } from "@/lib/whatsapp/account-status-machine";
import { hasRestorableWhatsAppCredentials } from "@/lib/whatsapp/session-manager";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { isPhonePairingActive } from "@/server/whatsapp/pairing-guard";

type SendableGroupScope = {
  userId: string;
  accountId: string;
};

async function requestConnectionSelfHeal(accountIds: string[], reason: string) {
  await Promise.all([...new Set(accountIds)].map(async (accountId) => {
    if (await isPhonePairingActive(accountId)) {
      logger.warn("whatsapp.v3.self_heal_skipped_active_pairing", { accountId, reason });
      return;
    }
    const hasCredentials = await hasRestorableWhatsAppCredentials(accountId).catch(() => false);
    if (!hasCredentials) return;
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null, OR: [{ lastError: null }, { lastError: { not: "WHATSAPP_LOGGED_OUT" } }] },
      data: { status: "CONNECTING", lastError: "WHATSAPP_TRANSIENT_DISCONNECT", recoveryLevel: 2 },
    });
    await enqueueWhatsAppJob("reconnect", { action: "reconnect", accountId }, { jobId: `v3-reconnect-${accountId}`, removeOnComplete: 50, removeOnFail: 100 })
      .catch((error) => logger.warn("whatsapp.v3.self_heal_reconnect_enqueue_failed", { accountId, reason, message: error instanceof Error ? error.message : String(error) }));
    await enqueueWhatsAppJob("sync", { action: "sync", accountId }, { jobId: `v3-sync-${accountId}`, delay: 5_000, removeOnComplete: 50, removeOnFail: 100 })
      .catch((error) => logger.warn("whatsapp.v3.self_heal_sync_enqueue_failed", { accountId, reason, message: error instanceof Error ? error.message : String(error) }));
  }));
}

export async function resolveSendableWhatsAppGroups(companyId: string, requestedIds: string[], scope: SendableGroupScope) {
  const uniqueIds = [...new Set(requestedIds)];
  if (!uniqueIds.length) return [];
  if (!scope.accountId || !scope.userId) throw new Error("WHATSAPP_ACCOUNT_SCOPE_REQUIRED");

  const candidateGroups = await prisma.whatsAppGroup.findMany({
    where: {
      companyId,
      userId: scope.userId,
      accountId: scope.accountId,
      id: { in: uniqueIds },
      isArchived: false,
      account: {
        id: scope.accountId,
        companyId,
        userId: scope.userId,
        archivedAt: null,
      },
    },
    include: { account: { select: { id: true, phoneNumber: true, status: true, lastError: true } } },
    orderBy: [{ canSend: "desc" }, { lastSyncedAt: "desc" }, { updatedAt: "desc" }],
  });

  if (candidateGroups.length !== uniqueIds.length) {
    logger.warn("whatsapp.sendable_groups.ownership_mismatch", {
      companyId,
      userId: scope.userId,
      whatsappAccountId: scope.accountId,
      requestedCount: uniqueIds.length,
      resolvedCount: candidateGroups.length,
    });
    throw new Error("WHATSAPP_GROUP_OWNERSHIP_MISMATCH");
  }

  const activeGroups = candidateGroups.filter((group) => isRecoverableWhatsAppStatus(group.account.status, group.account.lastError));
  if (!activeGroups.length && candidateGroups.length) {
    await requestConnectionSelfHeal([scope.accountId], "sendable_groups_empty");
  }

  return activeGroups.length
    ? activeGroups
    : candidateGroups.filter((group) => group.account.lastError !== "WHATSAPP_LOGGED_OUT");
}
