import { AccountStatus, type Prisma } from "@prisma/client";
import { isRecoverableWhatsAppStatus, RECOVERABLE_ACCOUNT_STATUSES } from "@/lib/whatsapp/account-status-machine";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";

const FATAL_LAST_ERRORS = ["WHATSAPP_LOGGED_OUT", "WHATSAPP_CREDENTIALS_MISSING"];
const GROUP_SYNC_STALE_MS = 5 * 60_000;

type AccountScope = {
  companyId: string;
  userId: string;
};

export function ownedWhatsAppAccountWhere(scope: AccountScope): Prisma.WhatsAppAccountWhereInput {
  return {
    companyId: scope.companyId,
    userId: scope.userId,
  };
}

export function ownedWhatsAppGroupWhere(scope: AccountScope & { accountId?: string }): Prisma.WhatsAppGroupWhereInput {
  return {
    companyId: scope.companyId,
    userId: scope.userId,
    ...(scope.accountId ? { accountId: scope.accountId } : {}),
  };
}

function recoverableAccountWhere(scope: AccountScope, accountId?: string): Prisma.WhatsAppAccountWhereInput {
  return {
    ...ownedWhatsAppAccountWhere(scope),
    ...(accountId ? { id: accountId } : {}),
    archivedAt: null,
    status: { in: [...RECOVERABLE_ACCOUNT_STATUSES] },
    OR: [{ lastError: null }, { lastError: { notIn: FATAL_LAST_ERRORS } }],
  };
}

export async function resolveCurrentWhatsAppAccount(scope: AccountScope, options: { accountId?: string; requireConnected?: boolean } = {}) {
  const account = await prisma.whatsAppAccount.findFirst({
    where: {
      ...recoverableAccountWhere(scope, options.accountId),
      ...(options.requireConnected ? { status: AccountStatus.CONNECTED } : {}),
    },
    include: { _count: { select: { groups: true, contacts: true, recipients: true } } },
    orderBy: [
      { lastConnectedAt: "desc" },
      { lastGroupSyncAt: "desc" },
      { updatedAt: "desc" },
    ],
  });
  return account && isRecoverableWhatsAppStatus(account.status, account.lastError) ? account : null;
}

export async function requireOwnedWhatsAppAccount(scope: AccountScope, accountId: string) {
  const account = await prisma.whatsAppAccount.findFirst({
    where: {
      ...ownedWhatsAppAccountWhere(scope),
      id: accountId,
    },
    include: { _count: { select: { groups: true, contacts: true, recipients: true } } },
  });
  if (!account) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
  return account;
}

export function isGroupSyncStale(account: { lastGroupSyncAt?: Date | null; lastSyncedAt?: Date | null }) {
  const lastSync = account.lastGroupSyncAt ?? account.lastSyncedAt;
  return !lastSync || Date.now() - lastSync.getTime() > GROUP_SYNC_STALE_MS;
}

export async function requestCurrentAccountGroupSync(
  scope: AccountScope,
  account: { id: string; phoneNumber?: string | null; lastGroupSyncAt?: Date | null; lastSyncedAt?: Date | null },
  source: string,
) {
  const job = await enqueueWhatsAppJob("sync", { action: "sync", accountId: account.id }, { jobId: `sync-${account.id}-${source}-${Date.now()}`, removeOnComplete: 50, removeOnFail: 100 });
  logger.info("whatsapp.group_sync.requested", {
    correlationId: job.id,
    source,
    userId: scope.userId,
    companyId: scope.companyId,
    whatsappAccountId: account.id,
    phoneNumber: account.phoneNumber,
    stale: isGroupSyncStale(account),
  });
  return job;
}

export async function requestGroupSyncIfStale(
  scope: AccountScope,
  account: { id: string; phoneNumber?: string | null; lastGroupSyncAt?: Date | null; lastSyncedAt?: Date | null },
  source: string,
) {
  if (!isGroupSyncStale(account)) return null;
  return requestCurrentAccountGroupSync(scope, account, source).catch((error) => {
    logger.warn("whatsapp.group_sync.stale_enqueue_failed", {
      source,
      userId: scope.userId,
      companyId: scope.companyId,
      whatsappAccountId: account.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
}

export async function assertGroupsBelongToCurrentAccount(scope: AccountScope & { accountId: string }, groupIds: string[]) {
  const uniqueIds = [...new Set(groupIds)];
  if (!uniqueIds.length) return [] as { id: string }[];
  const groups = await prisma.whatsAppGroup.findMany({
    where: {
      ...ownedWhatsAppGroupWhere(scope),
      id: { in: uniqueIds },
      isArchived: false,
      account: {
        ...ownedWhatsAppAccountWhere(scope),
        id: scope.accountId,
        archivedAt: null,
      },
    },
    select: { id: true },
  });
  if (groups.length !== uniqueIds.length) throw new Error("WHATSAPP_GROUP_OWNERSHIP_MISMATCH");
  return groups;
}
