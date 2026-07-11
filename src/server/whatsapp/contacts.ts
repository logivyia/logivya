import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { enqueueWhatsAppJob } from "@/server/queues/producer";
import { ownedWhatsAppAccountWhere, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import { normalizeProviderContact, type ProviderContactRecord } from "@/server/whatsapp/contact-normalization";

export { normalizeProviderContact, normalizeWhatsAppContactJid, type ProviderContactRecord } from "@/server/whatsapp/contact-normalization";

type ContactScope = { companyId: string; userId: string; accountId?: string };

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
    return { count: 0, syncedAt: null };
  }

  for (let offset = 0; offset < normalizedContacts.length; offset += 100) {
    const batch = normalizedContacts.slice(offset, offset + 100);
    await prisma.$transaction(batch.map((contact) => prisma.contact.upsert({
        where: { accountId_externalContactId: { accountId, externalContactId: contact.externalContactId } },
        create: {
          userId: account.userId,
          companyId: account.companyId,
          accountId,
          externalContactId: contact.externalContactId,
          phone: contact.phone,
          name: contact.name,
          pushName: contact.pushName,
          source: options.source ?? "BAILEYS",
          isWhatsAppUser: true,
          isActive: true,
          lastSeenAt: syncedAt,
        },
        update: {
          userId: account.userId,
          companyId: account.companyId,
          phone: contact.phone,
          name: contact.name ?? undefined,
          pushName: contact.pushName ?? undefined,
          source: options.source ?? "BAILEYS",
          isWhatsAppUser: true,
          isActive: true,
          lastSeenAt: syncedAt,
        },
      })));
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
  return { count: normalizedContacts.length, syncedAt };
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
    ? [{ updatedAt: "desc" }, { name: "asc" }]
    : input.sort === "name_desc"
      ? [{ name: "desc" }, { phone: "asc" }]
      : [{ name: "asc" }, { phone: "asc" }];
  const where: Prisma.ContactWhereInput = {
    ...ownedWhatsAppContactWhere({ companyId: input.companyId, userId: input.userId, accountId: account.id }),
    isActive: input.active ?? true,
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { pushName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    } : {}),
  };
  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: {
        id: true,
        accountId: true,
        externalContactId: true,
        phone: true,
        name: true,
        pushName: true,
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
  ]);
  return {
    account: { id: account.id, phoneNumber: account.phoneNumber, lastContactSyncAt: account.lastContactSyncAt },
    contacts,
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
  const job = await enqueueWhatsAppJob(
    "sync-contacts",
    { action: "sync-contacts", accountId: account.id },
    { jobId: `sync-contacts-${account.id}-${Date.now()}`, removeOnComplete: 50, removeOnFail: 100 },
  );
  logger.info("whatsapp.contact_sync.requested", {
    correlationId: job.id,
    source,
    userId: scope.userId,
    companyId: scope.companyId,
    whatsappAccountId: account.id,
  });
  return { account, job };
}
