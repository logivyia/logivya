import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { prisma } from "@/server/db";
import { encryptTelegramDatabaseKey } from "@/server/telegram/crypto";
import { TELEGRAM_CHANNEL_NAME, TELEGRAM_DEFAULT_ACCOUNT_LABEL, TELEGRAM_PROVIDER } from "@/server/telegram/constants";

export const telegramAccountSelect = {
  id: true,
  label: true,
  accountType: true,
  phoneNumberMasked: true,
  telegramUserId: true,
  username: true,
  firstName: true,
  lastName: true,
  status: true,
  authState: true,
  authStateDetail: true,
  lastConnectedAt: true,
  lastDisconnectedAt: true,
  lastSyncedAt: true,
  lastErrorCode: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listOwnedTelegramAccounts(ownerUserId: string, companyId: string) {
  return prisma.telegramAccount.findMany({
    where: { ownerUserId, companyId, archivedAt: null },
    select: telegramAccountSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function requireOwnedTelegramAccount(id: string, ownerUserId: string, companyId: string) {
  const account = await prisma.telegramAccount.findFirst({
    where: { id, ownerUserId, companyId, archivedAt: null },
  });
  if (!account) throw new Error("TELEGRAM_ACCOUNT_NOT_FOUND");
  return account;
}

export async function createOwnedTelegramAccount(input: { ownerUserId: string; companyId: string; label?: string }) {
  const label = input.label?.trim().slice(0, 80) || TELEGRAM_DEFAULT_ACCOUNT_LABEL;
  const lockKey = `telegram-account-create:${input.companyId}:${input.ownerUserId}`;

  return prisma.$transaction(async (tx) => {
    // Prisma's PostgreSQL driver cannot deserialize the native `void` returned
    // directly by pg_advisory_xact_lock. Keep the transaction-scoped lock, but
    // expose a supported integer result to the adapter.
    await tx.$queryRaw`WITH lock AS (SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)) SELECT 1::int AS acquired FROM lock`;
    const existing = await tx.telegramAccount.findFirst({
      where: {
        ownerUserId: input.ownerUserId,
        companyId: input.companyId,
        archivedAt: null,
        authState: {
          in: [
            "STARTING",
            "WAIT_PHONE_NUMBER",
            "WAIT_EMAIL_ADDRESS",
            "WAIT_EMAIL_CODE",
            "WAIT_CODE",
            "WAIT_PASSWORD",
            "WAIT_OTHER_DEVICE",
          ],
        },
      },
      select: telegramAccountSelect,
      orderBy: { createdAt: "asc" },
    });
    if (existing) return { account: existing, created: false };

    const databaseKey = randomBytes(32).toString("base64");
    const storageKey = randomUUID();
    const channel = await tx.channel.upsert({
      where: {
        companyId_type_name: {
          companyId: input.companyId,
          type: "TELEGRAM",
          name: TELEGRAM_CHANNEL_NAME,
        },
      },
      create: {
        companyId: input.companyId,
        type: "TELEGRAM",
        name: TELEGRAM_CHANNEL_NAME,
        isEnabled: true,
        settings: { provider: TELEGRAM_PROVIDER },
      },
      update: { isEnabled: true },
    });

    const channelAccount = await tx.channelAccount.create({
      data: {
        companyId: input.companyId,
        channelId: channel.id,
        label,
        provider: TELEGRAM_PROVIDER,
        status: "PENDING",
        safetyProfile: {
          create: {
            dailyLimit: Number(process.env.TELEGRAM_ACCOUNT_DAILY_LIMIT || 100),
            hourlyLimit: Number(process.env.TELEGRAM_ACCOUNT_HOURLY_LIMIT || 20),
            minDelayMs: Number(process.env.TELEGRAM_MIN_SEND_DELAY_MS || 3_000),
            maxDelayMs: Number(process.env.TELEGRAM_MAX_SEND_DELAY_MS || 9_000),
            policy: { floodWaitPolicy: "respect_server_retry" },
          },
        },
      },
    });

    const account = await tx.telegramAccount.create({
      data: {
        channelAccountId: channelAccount.id,
        companyId: input.companyId,
        ownerUserId: input.ownerUserId,
        storageKey,
        label,
        databaseKeyEncrypted: encryptTelegramDatabaseKey(databaseKey),
      },
      select: telegramAccountSelect,
    });
    return { account, created: true };
  });
}

export async function archiveOwnedTelegramAccount(id: string, ownerUserId: string, companyId: string) {
  const account = await requireOwnedTelegramAccount(id, ownerUserId, companyId);
  const now = new Date();
  await prisma.$transaction([
    prisma.telegramDelivery.updateMany({
      where: { run: { dispatch: { accountId: account.id } }, status: { in: ["QUEUED", "FLOOD_WAIT"] } },
      data: { status: "CANCELED", lockedAt: null, lockedBy: null },
    }),
    prisma.telegramDispatchRun.updateMany({
      where: { dispatch: { accountId: account.id }, status: "QUEUED" },
      data: { status: "CANCELED", completedAt: now },
    }),
    prisma.telegramDispatch.updateMany({
      where: { accountId: account.id, status: "ACTIVE" },
      data: { status: "CANCELED" },
    }),
    prisma.telegramAccount.update({
      where: { id: account.id },
      data: { status: "ARCHIVED", authState: "CLOSED", archivedAt: now, lastDisconnectedAt: now },
    }),
    prisma.channelAccount.update({
      where: { id: account.channelAccountId },
      data: { status: "ARCHIVED", archivedAt: now, lastDisconnectedAt: now },
    }),
  ]);
  return account;
}
