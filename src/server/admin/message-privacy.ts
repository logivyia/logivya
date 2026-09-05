import "server-only";

import type { Prisma } from "@prisma/client";

import {
  serializeAdminCampaignOperation,
  type AdminCampaignMetricsDto,
  type AdminCampaignOperationDto,
} from "@/server/admin/message-privacy-contract";
import { prisma } from "@/server/db";

type AdminCampaignPrivacyQuery = {
  page: number;
  limit: number;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

const MESSAGE_AUDIT_TERMS = [
  "message",
  "campaign",
  "recipient",
  "delivery",
  "contact_sync",
  "group_sync",
  "delete_for_everyone",
] as const;

function privacyReferenceSecret() {
  return process.env.OBSERVABILITY_HASH_KEY || process.env.SESSION_ENCRYPTION_KEY || process.env.AUTH_SECRET;
}

export function adminAuditPrivacyWhere(base: Prisma.AuditLogWhereInput = {}): Prisma.AuditLogWhereInput {
  const messageAuditFilters: Prisma.AuditLogWhereInput[] = MESSAGE_AUDIT_TERMS.flatMap((term) => [
    { action: { contains: term, mode: "insensitive" } },
    { entityType: { contains: term, mode: "insensitive" } },
  ]);
  return {
    AND: [
      base,
      { NOT: { OR: messageAuditFilters } },
    ],
  };
}

export function adminSecurityEventPrivacyWhere(base: Prisma.SecurityEventWhereInput = {}): Prisma.SecurityEventWhereInput {
  const messageEventFilters: Prisma.SecurityEventWhereInput[] = MESSAGE_AUDIT_TERMS.flatMap((term) => [
    { type: { contains: term, mode: "insensitive" } },
    { source: { contains: term, mode: "insensitive" } },
  ]);
  return {
    AND: [
      base,
      { NOT: { OR: messageEventFilters } },
    ],
  };
}

export async function getAdminCampaignPrivacySnapshot(query: AdminCampaignPrivacyQuery): Promise<{
  metrics: AdminCampaignMetricsDto;
  operations: AdminCampaignOperationDto[];
  pagination: { page: number; limit: number; total: number; pages: number; nextPage: number | null };
}> {
  const where: Prisma.MessageCampaignWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.dateFrom || query.dateTo ? {
      createdAt: {
        ...(query.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query.dateTo ? { lte: query.dateTo } : {}),
      },
    } : {}),
  };
  const [rows, total, statusCounts] = await Promise.all([
    prisma.messageCampaign.findMany({
      where,
      select: {
        id: true,
        status: true,
        totalRecipients: true,
        sentCount: true,
        failedCount: true,
        canceledCount: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.messageCampaign.count({ where }),
    prisma.messageCampaign.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const count = (status: string) => statusCounts.find((row) => row.status === status)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.limit));
  return {
    metrics: {
      totalOperations: total,
      successfulOperations: count("COMPLETED"),
      failedOperations: count("FAILED"),
      processingOperations: count("SENDING"),
      queuedOperations: count("QUEUED") + count("SCHEDULED"),
    },
    operations: rows.map((row) => serializeAdminCampaignOperation(row, privacyReferenceSecret())),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages,
      nextPage: query.page < pages ? query.page + 1 : null,
    },
  };
}
