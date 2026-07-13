import type { Prisma } from "@prisma/client";

import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import { resolveWhatsAppContactDisplayName } from "@/server/whatsapp/contact-normalization";

export const CONTACT_CATEGORY_PROFESSIONAL_MESSAGE =
  "Kişileri kategorilere ekleme ve kişilere mesaj gönderimi Profesyonel paketinde kullanılabilir.";

export class CategoryTargetError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly userMessage: string,
  ) {
    super(code);
    this.name = "CategoryTargetError";
  }
}

export function isCategoryTargetError(error: unknown): error is CategoryTargetError {
  return error instanceof CategoryTargetError;
}

type CategoryScope = {
  companyId: string;
  userId: string;
};

type CategoryMetadata = {
  name?: string;
  description?: string | null;
  color?: string;
};

type CategoryTargetInput = CategoryMetadata & {
  groupIds?: string[];
  contactIds?: string[];
};

const MAX_GROUP_ASSIGNMENTS = 5_000;
const MAX_CONTACT_ASSIGNMENTS = 50_000;

function uniqueIds(values: string[] | undefined, limit: number, code: string) {
  if (values === undefined) return undefined;
  const ids = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (ids.length > limit) throw new CategoryTargetError(code, 400, "Tek seferde seçilebilecek hedef sayısı aşıldı.");
  return ids;
}

async function assertContactEntitlement(companyId: string) {
  if (await subscriptionAccess.canUseContactMessaging(companyId)) return;
  throw new CategoryTargetError(
    "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL",
    403,
    CONTACT_CATEGORY_PROFESSIONAL_MESSAGE,
  );
}

async function resolveAssignmentAccount(scope: CategoryScope, groupIds: string[] | undefined, contactIds: string[] | undefined) {
  if (groupIds === undefined && contactIds === undefined) return null;
  const account = await resolveCurrentWhatsAppAccount(scope);
  if (account) return account;
  if ((groupIds?.length ?? 0) > 0 || (contactIds?.length ?? 0) > 0) {
    throw new CategoryTargetError("WHATSAPP_ACCOUNT_NOT_OWNED", 409, "WhatsApp hesabınızı bağlayın.");
  }
  return null;
}

async function validateGroups(
  tx: Prisma.TransactionClient,
  scope: CategoryScope,
  accountId: string,
  groupIds: string[],
) {
  if (!groupIds.length) return [];
  const groups = await tx.whatsAppGroup.findMany({
    where: {
      id: { in: groupIds },
      companyId: scope.companyId,
      userId: scope.userId,
      accountId,
      isArchived: false,
      account: { id: accountId, companyId: scope.companyId, userId: scope.userId, archivedAt: null },
    },
    select: { id: true },
  });
  if (groups.length !== groupIds.length) {
    throw new CategoryTargetError("CATEGORY_TARGET_VALIDATION_FAILED", 403, "Seçilen gruplardan biri bu WhatsApp hesabına ait değil.");
  }
  return groups;
}

async function validateContacts(
  tx: Prisma.TransactionClient,
  scope: CategoryScope,
  accountId: string,
  contactIds: string[],
) {
  if (!contactIds.length) return [];
  const contacts = await tx.contact.findMany({
    where: {
      id: { in: contactIds },
      companyId: scope.companyId,
      userId: scope.userId,
      accountId,
      isActive: true,
      isWhatsAppUser: true,
      account: { id: accountId, companyId: scope.companyId, userId: scope.userId, archivedAt: null },
    },
    select: { id: true },
  });
  if (contacts.length !== contactIds.length) {
    throw new CategoryTargetError("CONTACT_NOT_OWNED", 403, "Seçilen kişilerden biri bu WhatsApp hesabına ait değil.");
  }
  return contacts;
}

function assignmentResult<T extends { id: string; name: string; color: string; description: string | null }>(
  category: T,
  groupCount: number,
  contactCount: number,
) {
  return {
    ...category,
    assignedGroupCount: groupCount,
    assignedContactCount: contactCount,
    totalTargetCount: groupCount + contactCount,
    _count: { groups: groupCount, contacts: contactCount },
  };
}

export async function createCategoryWithTargets(scope: CategoryScope, input: Required<Pick<CategoryMetadata, "name" | "color">> & CategoryTargetInput) {
  const groupIds = uniqueIds(input.groupIds ?? [], MAX_GROUP_ASSIGNMENTS, "CATEGORY_TARGET_VALIDATION_FAILED") ?? [];
  const contactIds = uniqueIds(input.contactIds ?? [], MAX_CONTACT_ASSIGNMENTS, "CATEGORY_TARGET_VALIDATION_FAILED") ?? [];
  if (contactIds.length) await assertContactEntitlement(scope.companyId);
  const account = await resolveAssignmentAccount(scope, groupIds, contactIds);

  const result = await prisma.$transaction(async (tx) => {
    const groups = account ? await validateGroups(tx, scope, account.id, groupIds) : [];
    const contacts = account ? await validateContacts(tx, scope, account.id, contactIds) : [];
    const category = await tx.category.create({
      data: {
        companyId: scope.companyId,
        name: input.name,
        description: input.description,
        color: input.color,
      },
      select: { id: true, name: true, color: true, description: true },
    });
    if (groups.length) {
      await tx.categoryGroup.createMany({
        data: groups.map((group) => ({ categoryId: category.id, groupId: group.id })),
        skipDuplicates: true,
      });
    }
    if (contacts.length && account) {
      await tx.categoryContact.createMany({
        data: contacts.map((contact) => ({
          categoryId: category.id,
          contactId: contact.id,
          userId: scope.userId,
          companyId: scope.companyId,
          accountId: account.id,
        })),
        skipDuplicates: true,
      });
    }
    return assignmentResult(category, groups.length, contacts.length);
  });

  logger.info("CATEGORY_CONTACT_ASSIGNMENT_SAVED", {
    userId: scope.userId,
    companyId: scope.companyId,
    categoryId: result.id,
    whatsappAccountId: account?.id,
    addedContactCount: result.assignedContactCount,
    removedContactCount: 0,
    assignedGroupCount: result.assignedGroupCount,
    assignedContactCount: result.assignedContactCount,
  });
  return result;
}

export async function updateCategoryWithTargets(scope: CategoryScope, categoryId: string, input: CategoryTargetInput) {
  const startedAt = Date.now();
  const groupIds = uniqueIds(input.groupIds, MAX_GROUP_ASSIGNMENTS, "CATEGORY_TARGET_VALIDATION_FAILED");
  const contactIds = uniqueIds(input.contactIds, MAX_CONTACT_ASSIGNMENTS, "CATEGORY_TARGET_VALIDATION_FAILED");
  if (contactIds !== undefined) await assertContactEntitlement(scope.companyId);
  const account = await resolveAssignmentAccount(scope, groupIds, contactIds);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.category.findFirst({
      where: { id: categoryId, companyId: scope.companyId, archivedAt: null },
      select: { id: true },
    });
    if (!existing) throw new CategoryTargetError("CATEGORY_NOT_FOUND", 404, "Kategori bulunamadı.");

    const previousContactCount = await tx.categoryContact.count({
      where: { categoryId, userId: scope.userId, companyId: scope.companyId, ...(account ? { accountId: account.id } : {}) },
    });

    let assignedGroupCount: number;
    if (groupIds !== undefined) {
      const groups = account ? await validateGroups(tx, scope, account.id, groupIds) : [];
      await tx.categoryGroup.deleteMany({
        where: {
          categoryId,
          group: {
            companyId: scope.companyId,
            userId: scope.userId,
            ...(account ? { accountId: account.id } : {}),
          },
        },
      });
      if (groups.length) {
        await tx.categoryGroup.createMany({
          data: groups.map((group) => ({ categoryId, groupId: group.id })),
          skipDuplicates: true,
        });
      }
      assignedGroupCount = groups.length;
    } else {
      assignedGroupCount = await tx.categoryGroup.count({
        where: {
          categoryId,
          group: {
            companyId: scope.companyId,
            userId: scope.userId,
            ...(account ? { accountId: account.id } : {}),
            isArchived: false,
          },
        },
      });
    }

    let assignedContactCount: number;
    if (contactIds !== undefined) {
      const contacts = account ? await validateContacts(tx, scope, account.id, contactIds) : [];
      await tx.categoryContact.deleteMany({
        where: { categoryId, userId: scope.userId, companyId: scope.companyId, ...(account ? { accountId: account.id } : {}) },
      });
      if (contacts.length && account) {
        await tx.categoryContact.createMany({
          data: contacts.map((contact) => ({
            categoryId,
            contactId: contact.id,
            userId: scope.userId,
            companyId: scope.companyId,
            accountId: account.id,
          })),
          skipDuplicates: true,
        });
      }
      assignedContactCount = contacts.length;
    } else {
      assignedContactCount = await tx.categoryContact.count({
        where: {
          categoryId,
          userId: scope.userId,
          companyId: scope.companyId,
          ...(account ? { accountId: account.id } : {}),
          contact: { isActive: true, isWhatsAppUser: true },
        },
      });
    }

    const category = await tx.category.update({
      where: { id: categoryId },
      data: { name: input.name, description: input.description, color: input.color },
      select: { id: true, name: true, color: true, description: true },
    });
    return {
      category: assignmentResult(category, assignedGroupCount, assignedContactCount),
      previousContactCount,
    };
  });

  const addedContactCount = Math.max(0, result.category.assignedContactCount - result.previousContactCount);
  const removedContactCount = Math.max(0, result.previousContactCount - result.category.assignedContactCount);
  logger.info("CATEGORY_CONTACT_ASSIGNMENT_SAVED", {
    userId: scope.userId,
    companyId: scope.companyId,
    categoryId,
    whatsappAccountId: account?.id,
    addedContactCount,
    removedContactCount,
    assignedGroupCount: result.category.assignedGroupCount,
    assignedContactCount: result.category.assignedContactCount,
    duration: Date.now() - startedAt,
  });
  if (addedContactCount) logger.info("CATEGORY_CONTACT_ASSIGNED", { userId: scope.userId, companyId: scope.companyId, categoryId, whatsappAccountId: account?.id, addedContactCount });
  if (removedContactCount) logger.info("CATEGORY_CONTACT_REMOVED", { userId: scope.userId, companyId: scope.companyId, categoryId, whatsappAccountId: account?.id, removedContactCount });
  return result.category;
}

export async function listCategoryContactAssignments(
  scope: CategoryScope,
  categoryId: string,
  options: { page?: number; limit?: number; search?: string } = {},
) {
  const startedAt = Date.now();
  await assertContactEntitlement(scope.companyId);
  const category = await prisma.category.findFirst({
    where: { id: categoryId, companyId: scope.companyId, archivedAt: null },
    select: { id: true, name: true, color: true, description: true },
  });
  if (!category) throw new CategoryTargetError("CATEGORY_NOT_FOUND", 404, "Kategori bulunamadı.");
  const account = await resolveCurrentWhatsAppAccount(scope);
  if (!account) throw new CategoryTargetError("WHATSAPP_ACCOUNT_NOT_OWNED", 409, "WhatsApp hesabınızı bağlayın.");

  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(100, Math.max(10, Math.trunc(options.limit ?? 50)));
  const search = options.search?.trim().slice(0, 100);
  const contactWhere: Prisma.ContactWhereInput = {
    companyId: scope.companyId,
    userId: scope.userId,
    accountId: account.id,
    isActive: true,
    isWhatsAppUser: true,
    account: { id: account.id, companyId: scope.companyId, userId: scope.userId, archivedAt: null },
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

  const [contacts, total, assignedRows] = await Promise.all([
    prisma.contact.findMany({
      where: contactWhere,
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
      orderBy: [{ displayName: "asc" }, { phone: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contact.count({ where: contactWhere }),
    prisma.categoryContact.findMany({
      where: {
        categoryId,
        userId: scope.userId,
        companyId: scope.companyId,
        accountId: account.id,
        contact: contactWhere,
      },
      select: { contact: { select: { id: true } } },
      take: MAX_CONTACT_ASSIGNMENTS,
    }),
  ]);

  const assignedContactIds = assignedRows.map(({ contact }) => contact.id);
  const assignedSet = new Set(assignedContactIds);
  const visibleContacts = contacts.map((contact) => ({
    ...contact,
    displayName: contact.displayName || resolveWhatsAppContactDisplayName(contact),
    name: contact.displayName || resolveWhatsAppContactDisplayName(contact),
    assigned: assignedSet.has(contact.id),
  }));

  logger.info("CATEGORY_CONTACT_ASSIGNMENT_OPENED", {
    userId: scope.userId,
    companyId: scope.companyId,
    categoryId,
    whatsappAccountId: account.id,
    assignedContactCount: assignedContactIds.length,
    duration: Date.now() - startedAt,
  });
  return {
    category,
    account: { id: account.id, phoneNumber: account.phoneNumber, lastContactSyncAt: account.lastContactSyncAt },
    contacts: visibleContacts,
    assignedContactIds,
    assignedContactCount: assignedContactIds.length,
    pageInfo: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total },
  };
}

export async function resolveCategoryContactsForSend(
  scope: CategoryScope & { accountId: string },
  categoryIds: string[],
  context: { correlationId?: string } = {},
) {
  const uniqueCategoryIds = [...new Set(categoryIds)];
  if (!uniqueCategoryIds.length) return { contacts: [], assignedCount: 0, skippedStaleCount: 0 };
  const startedAt = Date.now();
  logger.info("CATEGORY_TARGET_RESOLUTION_STARTED", {
    correlationId: context.correlationId,
    userId: scope.userId,
    companyId: scope.companyId,
    whatsappAccountId: scope.accountId,
    requestedCategoryCount: uniqueCategoryIds.length,
  });

  const assignmentWhere: Prisma.CategoryContactWhereInput = {
    categoryId: { in: uniqueCategoryIds },
    userId: scope.userId,
    companyId: scope.companyId,
    accountId: scope.accountId,
    category: { companyId: scope.companyId, archivedAt: null },
  };
  const [assignedCount, activeLinks] = await Promise.all([
    prisma.categoryContact.count({ where: assignmentWhere }),
    prisma.categoryContact.findMany({
      where: {
        ...assignmentWhere,
        contact: {
          companyId: scope.companyId,
          userId: scope.userId,
          accountId: scope.accountId,
          isActive: true,
          isWhatsAppUser: true,
          account: { id: scope.accountId, companyId: scope.companyId, userId: scope.userId, archivedAt: null },
        },
      },
      select: { contact: true },
    }),
  ]);
  const byIdentity = new Map<string, (typeof activeLinks)[number]["contact"]>();
  for (const { contact } of activeLinks) {
    byIdentity.set(`${contact.accountId}:${contact.externalContactId}`, contact);
  }
  const contacts = [...byIdentity.values()];
  const skippedStaleCount = Math.max(0, assignedCount - contacts.length);
  if (skippedStaleCount) {
    logger.warn("CATEGORY_TARGET_SKIPPED_STALE", {
      correlationId: context.correlationId,
      userId: scope.userId,
      companyId: scope.companyId,
      whatsappAccountId: scope.accountId,
      skippedStaleCount,
    });
  }
  logger.info("CATEGORY_TARGET_RESOLUTION_COMPLETED", {
    correlationId: context.correlationId,
    userId: scope.userId,
    companyId: scope.companyId,
    whatsappAccountId: scope.accountId,
    requestedCategoryCount: uniqueCategoryIds.length,
    assignedContactCount: assignedCount,
    resolvedContactCount: contacts.length,
    skippedStaleCount,
    duration: Date.now() - startedAt,
  });
  return { contacts, assignedCount, skippedStaleCount };
}
