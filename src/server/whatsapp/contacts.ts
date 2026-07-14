import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { ownedWhatsAppAccountWhere, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import {
  normalizeProviderContact,
  resolveWhatsAppContactDisplayIdentity,
  resolveWhatsAppContactDisplayName,
  type ProviderContactRecord,
} from "@/server/whatsapp/contact-normalization";

export { normalizeProviderContact, normalizeWhatsAppContactJid, type ProviderContactRecord } from "@/server/whatsapp/contact-normalization";

type ContactScope = { companyId: string; userId: string; accountId?: string };
const CONTACT_PERSISTENCE_BATCH_SIZE = 40;

export function normalizeWhatsAppAccountIdentity(value: string | null | undefined) {
  const identity = value?.split(":")[0]?.split("@")[0]?.replace(/\D/g, "") ?? "";
  return identity.length >= 7 ? identity : null;
}

export async function resetWhatsAppContactDirectoryIfIdentityChanged(accountId: string, nextIdentityValue: string | null | undefined, source: string) {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, companyId: true, phoneNumber: true, deviceId: true, archivedAt: true },
  });
  if (!account || account.archivedAt) return { changed: false, deactivatedCount: 0 };

  const previousIdentity = normalizeWhatsAppAccountIdentity(account.deviceId) || normalizeWhatsAppAccountIdentity(account.phoneNumber);
  const nextIdentity = normalizeWhatsAppAccountIdentity(nextIdentityValue);
  if (!previousIdentity || !nextIdentity || previousIdentity === nextIdentity) {
    return { changed: false, deactivatedCount: 0 };
  }

  const [deactivated] = await prisma.$transaction([
    prisma.contact.updateMany({ where: { accountId, isActive: true }, data: { isActive: false } }),
    prisma.whatsAppAccount.update({ where: { id: accountId }, data: { lastContactSyncAt: null } }),
  ]);
  logger.warn("whatsapp.contacts.identity_changed", {
    userId: account.userId ?? undefined,
    companyId: account.companyId,
    whatsappAccountId: accountId,
    source,
    deactivatedCount: deactivated.count,
  });
  return { changed: true, deactivatedCount: deactivated.count };
}

export function ownedWhatsAppContactWhere(scope: ContactScope): Prisma.ContactWhereInput {
  return {
    companyId: scope.companyId,
    userId: scope.userId,
    ...(scope.accountId ? { accountId: scope.accountId } : {}),
    account: {
      ...ownedWhatsAppAccountWhere(scope),
      ...(scope.accountId ? { id: scope.accountId } : {}),
      archivedAt: null,
    },
  };
}

export async function persistWhatsAppContacts(accountId: string, contacts: ProviderContactRecord[], options: { fullSync?: boolean; source?: string } = {}) {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, companyId: true, archivedAt: true },
  });
  if (!account || account.archivedAt || !account.userId) throw new Error("WHATSAPP_ACCOUNT_OWNERSHIP_REQUIRED");

  const deduplicated = new Map<string, NonNullable<ReturnType<typeof normalizeProviderContact>>>();
  for (const contact of contacts) {
    const normalized = normalizeProviderContact(contact);
    if (normalized) deduplicated.set(normalized.externalContactId, normalized);
  }
  const normalizedContacts = [...deduplicated.values()];
  const syncedAt = new Date();

  if (!normalizedContacts.length) {
    logger.warn("whatsapp.contacts.persist_skipped_empty", {
      userId: account.userId,
      companyId: account.companyId,
      whatsappAccountId: accountId,
      receivedCount: contacts.length,
      source: options.source ?? "BAILEYS",
    });
    return { count: 0, namedCount: 0, fallbackCount: 0, syncedAt: null };
  }

  for (let offset = 0; offset < normalizedContacts.length; offset += CONTACT_PERSISTENCE_BATCH_SIZE) {
    const batch = normalizedContacts.slice(offset, offset + CONTACT_PERSISTENCE_BATCH_SIZE);
    const existing = await prisma.contact.findMany({
      where: { accountId, externalContactId: { in: batch.map((contact) => contact.externalContactId) } },
      select: {
        externalContactId: true,
        name: true,
        pushName: true,
        notifyName: true,
        verifiedName: true,
        displayName: true,
        displayNameSource: true,
      },
    });
    const existingByExternalId = new Map(existing.map((contact) => [contact.externalContactId, contact]));
    await prisma.$transaction(batch.map((contact) => {
      const previous = existingByExternalId.get(contact.externalContactId);
      const name = contact.name ?? previous?.name ?? null;
      const pushName = contact.pushName ?? previous?.pushName ?? null;
      const notifyName = contact.notifyName ?? previous?.notifyName ?? null;
      const verifiedName = contact.verifiedName ?? previous?.verifiedName ?? null;
      const identity = resolveWhatsAppContactDisplayIdentity({
        phone: contact.phone,
        name,
        pushName,
        notifyName,
        verifiedName,
        displayName: previous?.displayName,
        displayNameSource: previous?.displayNameSource,
      });
      return prisma.contact.upsert({
        where: { accountId_externalContactId: { accountId, externalContactId: contact.externalContactId } },
        create: {
          userId: account.userId,
          companyId: account.companyId,
          accountId,
          externalContactId: contact.externalContactId,
          phone: contact.phone,
          name,
          pushName,
          notifyName,
          verifiedName,
          ...identity,
          source: options.source ?? "BAILEYS",
          isWhatsAppUser: true,
          isActive: true,
          lastSeenAt: syncedAt,
          lastSyncedAt: syncedAt,
        },
        update: {
          userId: account.userId,
          companyId: account.companyId,
          phone: contact.phone,
          name,
          pushName,
          notifyName,
          verifiedName,
          ...identity,
          source: options.source ?? "BAILEYS",
          isWhatsAppUser: true,
          isActive: true,
          lastSeenAt: syncedAt,
          lastSyncedAt: syncedAt,
        },
      });
    }));
  }
  if (options.fullSync && normalizedContacts.length > 0) {
    await prisma.contact.updateMany({
      where: { accountId, externalContactId: { notIn: normalizedContacts.map((contact) => contact.externalContactId) } },
      data: { isActive: false },
    });
  }
  await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { lastContactSyncAt: syncedAt } });

  logger.info("whatsapp.contacts.persisted", {
    userId: account.userId,
    companyId: account.companyId,
    whatsappAccountId: accountId,
    receivedCount: contacts.length,
    persistedCount: normalizedContacts.length,
    fullSync: Boolean(options.fullSync),
    source: options.source ?? "BAILEYS",
  });
  const fallbackCount = normalizedContacts.filter((contact) => contact.displayNameSource === "PHONE_FALLBACK").length;
  return {
    count: normalizedContacts.length,
    namedCount: normalizedContacts.length - fallbackCount,
    fallbackCount,
    syncedAt,
  };
}

export async function listOwnedWhatsAppContacts(input: ContactScope & {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
  sort?: "name_asc" | "name_desc" | "updated_desc";
}) {
  const account = await resolveCurrentWhatsAppAccount(
    { companyId: input.companyId, userId: input.userId },
    { accountId: input.accountId },
  );
  if (!account) throw new Error("WHATSAPP_ACCOUNT_REQUIRED");
  const requestedPage = Number.isFinite(input.page) ? Math.trunc(input.page ?? 1) : 1;
  const requestedLimit = Number.isFinite(input.limit) ? Math.trunc(input.limit ?? 30) : 30;
  const page = Math.max(1, requestedPage);
  const limit = Math.min(100, Math.max(10, requestedLimit));
  const search = input.search?.trim().slice(0, 100);
  const orderBy: Prisma.ContactOrderByWithRelationInput[] = input.sort === "updated_desc"
    ? [{ updatedAt: "desc" }, { displayName: "asc" }]
    : input.sort === "name_desc"
      ? [{ displayName: "desc" }, { phone: "asc" }]
      : [{ displayName: "asc" }, { phone: "asc" }];
  const where: Prisma.ContactWhereInput = {
    ...ownedWhatsAppContactWhere({ companyId: input.companyId, userId: input.userId, accountId: account.id }),
    isActive: input.active ?? true,
    AND: [
      ...(search ? [{
        OR: [
          { displayName: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
          { pushName: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
        ],
      }] : []),
    ],
  };
  const [contacts, total, syncRun] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        accountId: true,
        externalContactId: true,
        phone: true,
        name: true,
        pushName: true,
        notifyName: true,
        verifiedName: true,
        displayName: true,
        displayNameSource: true,
        isWhatsAppUser: true,
        isActive: true,
        lastSeenAt: true,
        updatedAt: true,
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contact.count({ where }),
    prisma.contactSyncRun.findFirst({
      where: { accountId: account.id, companyId: input.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        discoveredCount: true,
        persistedCount: true,
        namedCount: true,
        fallbackCount: true,
        errorCode: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
  ]);
  const visibleContacts = contacts.map((contact) => ({
    ...contact,
    displayName: contact.displayName || resolveWhatsAppContactDisplayName(contact),
  }));
  return {
    account: { id: account.id, phoneNumber: account.phoneNumber, lastContactSyncAt: account.lastContactSyncAt },
    contacts: visibleContacts,
    syncRun,
    pageInfo: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total },
  };
}

export async function resolveOwnedWhatsAppContacts(scope: Required<ContactScope>, contactIds: string[]) {
  const uniqueIds = [...new Set(contactIds)];
  if (!uniqueIds.length) return [];
  const contacts = await prisma.contact.findMany({
    where: {
      ...ownedWhatsAppContactWhere(scope),
      id: { in: uniqueIds },
      isActive: true,
      isWhatsAppUser: true,
    },
    orderBy: [{ name: "asc" }, { phone: "asc" }],
  });
  if (contacts.length !== uniqueIds.length) throw new Error("WHATSAPP_CONTACT_OWNERSHIP_MISMATCH");
  return contacts;
}

export async function requestCurrentAccountContactSync(scope: { companyId: string; userId: string }, accountId?: string, source = "contacts-api") {
  const account = await resolveCurrentWhatsAppAccount(scope, { accountId });
  if (!account) throw new Error("WHATSAPP_ACCOUNT_REQUIRED");
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const syncRequest = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "WhatsAppAccount" WHERE "id" = ${account.id} FOR UPDATE`;
    await tx.contactSyncRun.updateMany({
      where: { accountId: account.id, status: { in: ["QUEUED", "RUNNING"] }, updatedAt: { lt: staleBefore } },
      data: { status: "FAILED", errorCode: "CONTACT_SYNC_STALE", completedAt: new Date() },
    });
    const existing = await tx.contactSyncRun.findFirst({
      where: { accountId: account.id, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { run: existing, reused: true };
    const run = await tx.contactSyncRun.create({
      data: {
        accountId: account.id,
        companyId: scope.companyId,
        requestedByUserId: scope.userId,
        source,
      },
    });
    return { run, reused: false };
  });
  const jobId = `sync-contacts-${syncRequest.run.id}`;
  if (!syncRequest.reused) {
    try {
      await enqueueWhatsAppJob(
        "sync-contacts",
        { action: "sync-contacts", accountId: account.id, syncRunId: syncRequest.run.id },
        { jobId, removeOnComplete: 50, removeOnFail: 100 },
      );
    } catch (error) {
      await failContactSyncRun(syncRequest.run.id, account.id, "CONTACT_SYNC_QUEUE_FAILED");
      throw error;
    }
  }
  logger.info("whatsapp.contact_sync.requested", {
    correlationId: jobId,
    source,
    userId: scope.userId,
    companyId: scope.companyId,
    whatsappAccountId: account.id,
    syncRunId: syncRequest.run.id,
    reused: syncRequest.reused,
  });
  return { account, jobId, syncRun: syncRequest.run, reused: syncRequest.reused };
}

export async function startContactSyncRun(syncRunId: string | undefined, accountId: string) {
  if (!syncRunId) return;
  await prisma.contactSyncRun.updateMany({
    where: { id: syncRunId, accountId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), errorCode: null },
  });
}

export async function completeContactSyncRun(
  syncRunId: string | undefined,
  accountId: string,
  options: { status?: "COMPLETED" | "PARTIAL"; errorCode?: string } = {},
) {
  if (!syncRunId) return;
  const [persistedCount, fallbackCount] = await Promise.all([
    prisma.contact.count({ where: { accountId, isActive: true, isWhatsAppUser: true } }),
    prisma.contact.count({ where: { accountId, isActive: true, isWhatsAppUser: true, displayNameSource: "PHONE_FALLBACK" } }),
  ]);
  await prisma.contactSyncRun.updateMany({
    where: { id: syncRunId, accountId, status: { in: ["QUEUED", "RUNNING"] } },
    data: {
      status: options.status ?? "COMPLETED",
      discoveredCount: persistedCount,
      persistedCount,
      namedCount: persistedCount - fallbackCount,
      fallbackCount,
      errorCode: options.errorCode ?? null,
      completedAt: new Date(),
    },
  });
}

export async function failContactSyncRun(syncRunId: string | undefined, accountId: string, errorCode: string) {
  if (!syncRunId) return;
  await prisma.contactSyncRun.updateMany({
    where: { id: syncRunId, accountId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "FAILED", errorCode: errorCode.slice(0, 200), completedAt: new Date() },
  });
}
