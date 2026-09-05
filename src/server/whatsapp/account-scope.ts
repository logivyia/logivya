import { AccountStatus, type Prisma } from "@prisma/client";
import { isRecoverableWhatsAppStatus, RECOVERABLE_ACCOUNT_STATUSES } from "@/lib/whatsapp/account-status-machine";
import { hasRestorableWhatsAppCredentials } from "@/lib/whatsapp/session-manager";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { requestWhatsAppSessionRestoreIfNeeded } from "@/server/whatsapp/session-restore";

const FATAL_LAST_ERRORS = ["WHATSAPP_LOGGED_OUT"];
const GROUP_SYNC_STALE_MS = 5 * 60_000;
const RESTORABLE_STATUSES = [...RECOVERABLE_ACCOUNT_STATUSES, AccountStatus.FAILED, AccountStatus.ERROR] as const;

type AccountScope = {
  companyId: string;
  userId: string;
};

type RecoverableAccountListOptions = {
  accountId?: string;
  requireConnected?: boolean;
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

export async function listRecoverableWhatsAppAccounts(
  scope: AccountScope,
  options: RecoverableAccountListOptions = {},
) {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: {
      ...ownedWhatsAppAccountWhere(scope),
      ...(options.accountId ? { id: options.accountId } : {}),
      archivedAt: null,
      status: options.requireConnected
        ? AccountStatus.CONNECTED
        : { in: [...RESTORABLE_STATUSES] },
      OR: [{ lastError: null }, { lastError: { notIn: FATAL_LAST_ERRORS } }],
    },
    include: { _count: { select: { groups: true, contacts: true, recipients: true } } },
    orderBy: [
      { lastConnectedAt: "desc" },
      { lastGroupSyncAt: "desc" },
      { updatedAt: "desc" },
    ],
  });

  if (options.requireConnected) return accounts;

  const recoverableAccounts = (
    await Promise.all(
      accounts.map(async (account) => {
        if (isRecoverableWhatsAppStatus(account.status, account.lastError)) return account;
        const restorable = await hasRestorableWhatsAppCredentials(account.id).catch((error) => {
          logger.warn("whatsapp.account_scope.restorable_check_failed", {
            companyId: scope.companyId,
            userId: scope.userId,
            whatsappAccountId: account.id,
            message: error instanceof Error ? error.message : String(error),
          });
          return false;
        });
        return restorable ? account : null;
      }),
    )
  ).filter((account): account is NonNullable<typeof account> => Boolean(account));

  await Promise.all(
    recoverableAccounts.map((account) =>
      requestWhatsAppSessionRestoreIfNeeded(account, scope, "account-list").catch((error) =>
        logger.warn("whatsapp.account_scope.restore_enqueue_failed", {
          companyId: scope.companyId,
          userId: scope.userId,
          whatsappAccountId: account.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      ),
    ),
  );
  return recoverableAccounts;
}

export async function resolveCurrentWhatsAppAccount(scope: AccountScope, options: { accountId?: string; requireConnected?: boolean } = {}) {
  const accounts = await listRecoverableWhatsAppAccounts(scope, {
    accountId: options.accountId,
    requireConnected: options.requireConnected,
  });
  return accounts[0] ?? null;
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
