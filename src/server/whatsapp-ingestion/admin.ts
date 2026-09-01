import "server-only";

import { Prisma, type LogisticsSectorClassification, type LogisticsSourceGroupHint, type MarketplaceScope, type WhatsAppIngestionStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { decryptPrivateValue, encryptPrivateValue } from "@/server/security/private-fields";
import { isWhatsAppIngestionHeartbeatFresh, readWhatsAppIngestionHeartbeat } from "@/server/whatsapp-ingestion/heartbeat";

export type IngestionGroupUpdate = {
  ingestionEnabled?: boolean;
  approvalConfirmed?: boolean;
  autoPublicationEnabled?: boolean;
  manualReviewRequired?: boolean;
  minimumConfidence?: number;
  sectorHint?: LogisticsSourceGroupHint;
  paused?: boolean;
};

export async function listWhatsAppIngestionGroups(input: {
  ownerUserId: string;
  query?: string;
  enabled?: boolean;
  recommended?: boolean;
  limit?: number;
  cursor?: string;
}) {
  const limit = Math.min(200, Math.max(1, input.limit ?? 100));
  const rows = await prisma.whatsAppGroup.findMany({
    where: {
      isArchived: false,
      account: { userId: input.ownerUserId, archivedAt: null },
      ...(input.enabled === undefined ? {} : { ingestionEnabled: input.enabled }),
      ...(input.recommended === undefined ? {} : { logisticsGroupRecommended: input.recommended }),
      ...(input.query ? {
        OR: [
          { name: { contains: input.query, mode: "insensitive" } },
          { externalGroupId: { contains: input.query, mode: "insensitive" } },
        ],
      } : {}),
    },
    select: {
      id: true,
      name: true,
      externalGroupId: true,
      participantCount: true,
      lastSyncedAt: true,
      lastInboundMessageAt: true,
      lastPublishedListingAt: true,
      processedMessageCount: true,
      publishedListingCount: true,
      failedMessageCount: true,
      ingestionEnabled: true,
      ingestionApprovedAt: true,
      logisticsGroupRecommended: true,
      logisticsRecommendationConfidence: true,
      autoPublicationEnabled: true,
      manualReviewRequired: true,
      minimumConfidence: true,
      sectorHint: true,
      ingestionPausedAt: true,
      account: { select: { id: true, status: true, lastConnectedAt: true, lastHeartbeatAt: true } },
    },
    orderBy: [{ ingestionEnabled: "desc" }, { lastInboundMessageAt: "desc" }, { name: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { groups: page, pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } };
}

export async function updateWhatsAppIngestionGroup(id: string, input: IngestionGroupUpdate, actorUserId: string) {
  const current = await prisma.whatsAppGroup.findFirst({
    where: { id, isArchived: false, account: { userId: actorUserId, archivedAt: null } },
  });
  if (!current) throw new Error("WHATSAPP_INGESTION_GROUP_NOT_FOUND");
  if (input.ingestionEnabled === true && !current.ingestionApprovedAt && input.approvalConfirmed !== true) {
    throw new Error("WHATSAPP_INGESTION_APPROVAL_REQUIRED");
  }
  const data: Prisma.WhatsAppGroupUpdateInput = {};
  if (input.ingestionEnabled !== undefined) data.ingestionEnabled = input.ingestionEnabled;
  if (input.ingestionEnabled === true && !current.ingestionApprovedAt) {
    data.ingestionApprovedAt = new Date();
    data.ingestionApprovedById = actorUserId;
  }
  if (input.autoPublicationEnabled !== undefined) data.autoPublicationEnabled = input.autoPublicationEnabled;
  if (input.manualReviewRequired !== undefined) data.manualReviewRequired = input.manualReviewRequired;
  if (input.minimumConfidence !== undefined) data.minimumConfidence = Math.min(100, Math.max(50, input.minimumConfidence));
  if (input.sectorHint !== undefined) data.sectorHint = input.sectorHint;
  if (input.paused !== undefined) data.ingestionPausedAt = input.paused ? new Date() : null;
  const updated = await prisma.whatsAppGroup.update({ where: { id }, data });
  await prisma.whatsAppIngestionAuditLog.create({
    data: {
      groupId: id,
      actorUserId,
      action: "ingestion.source.updated",
      metadata: safeGroupPolicySnapshot(updated),
    },
  });
  return updated;
}

export async function bulkUpdateWhatsAppIngestionGroups(input: {
  ids: string[];
  enabled: boolean;
  approvalConfirmed?: boolean;
  actorUserId: string;
}) {
  const ids = [...new Set(input.ids)].slice(0, 500);
  if (!ids.length) throw new Error("WHATSAPP_INGESTION_GROUP_IDS_REQUIRED");
  const groups = await prisma.whatsAppGroup.findMany({
    where: {
      id: { in: ids },
      isArchived: false,
      account: { userId: input.actorUserId, archivedAt: null },
    },
  });
  if (groups.length !== ids.length) throw new Error("WHATSAPP_INGESTION_GROUP_NOT_FOUND");
  if (input.enabled && input.approvalConfirmed !== true && groups.some((group) => !group.ingestionApprovedAt)) {
    throw new Error("WHATSAPP_INGESTION_APPROVAL_REQUIRED");
  }
  await prisma.$transaction(async (tx) => {
    for (const group of groups) {
      await tx.whatsAppGroup.update({
        where: { id: group.id },
        data: {
          ingestionEnabled: input.enabled,
          ...(input.enabled && !group.ingestionApprovedAt ? { ingestionApprovedAt: new Date(), ingestionApprovedById: input.actorUserId } : {}),
        },
      });
      await tx.whatsAppIngestionAuditLog.create({
        data: {
          groupId: group.id,
          actorUserId: input.actorUserId,
          action: input.enabled ? "ingestion.source.bulk_enabled" : "ingestion.source.bulk_disabled",
          metadata: { enabled: input.enabled },
        },
      });
    }
  });
  return { updated: groups.length };
}

export async function updateWhatsAppIngestionControl(input: {
  globallyPaused?: boolean;
  emergencyKillSwitch?: boolean;
  pauseReason?: string | null;
  rawRetentionDays?: number;
  mediaRetentionDays?: number;
  staleAlertMinutes?: number;
  actorUserId: string;
}) {
  return prisma.whatsAppIngestionControl.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      globallyPaused: input.globallyPaused ?? false,
      emergencyKillSwitch: input.emergencyKillSwitch ?? false,
      pauseReason: input.pauseReason?.slice(0, 500) || null,
      rawRetentionDays: Math.min(30, Math.max(1, input.rawRetentionDays ?? 7)),
      mediaRetentionDays: Math.min(30, Math.max(1, input.mediaRetentionDays ?? 7)),
      staleAlertMinutes: Math.min(120, Math.max(5, input.staleAlertMinutes ?? 15)),
      updatedById: input.actorUserId,
    },
    update: {
      ...(input.globallyPaused !== undefined ? { globallyPaused: input.globallyPaused } : {}),
      ...(input.emergencyKillSwitch !== undefined ? { emergencyKillSwitch: input.emergencyKillSwitch } : {}),
      ...(input.pauseReason !== undefined ? { pauseReason: input.pauseReason?.slice(0, 500) || null } : {}),
      ...(input.rawRetentionDays !== undefined ? { rawRetentionDays: Math.min(30, Math.max(1, input.rawRetentionDays)) } : {}),
      ...(input.mediaRetentionDays !== undefined ? { mediaRetentionDays: Math.min(30, Math.max(1, input.mediaRetentionDays)) } : {}),
      ...(input.staleAlertMinutes !== undefined ? { staleAlertMinutes: Math.min(120, Math.max(5, input.staleAlertMinutes)) } : {}),
      updatedById: input.actorUserId,
    },
  });
}

export async function whatsappIngestionHealth(ownerUserId: string) {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const control = await prisma.whatsAppIngestionControl.findUnique({ where: { id: "global" } });
  const staleMinutes = control?.staleAlertMinutes ?? 15;
  const staleBefore = new Date(now.getTime() - staleMinutes * 60_000);
  const [
    connectedAccounts,
    activeGroups,
    messagesLastHour,
    logisticsListings,
    autoPublished,
    pendingReview,
    duplicates,
    failures,
    deadLetters,
    generatedMatches,
    notificationDeliveries,
    staleGroups,
    oldestPending,
    recentDurations,
    failedAiRequests,
    lastSuccessfulMessage,
    lastConnectedAccount,
    workerHeartbeat,
  ] = await Promise.all([
    prisma.whatsAppAccount.count({ where: { userId: ownerUserId, status: "CONNECTED", archivedAt: null } }),
    prisma.whatsAppGroup.count({ where: { ingestionEnabled: true, ingestionPausedAt: null, isArchived: false, account: { userId: ownerUserId, archivedAt: null } } }),
    prisma.whatsAppInboundMessage.count({ where: { receivedAt: { gte: hourAgo }, account: { userId: ownerUserId, archivedAt: null } } }),
    prisma.whatsAppListingExtraction.count({ where: { isLogisticsListing: true, createdAt: { gte: dayAgo }, inboundMessage: { account: { userId: ownerUserId, archivedAt: null } } } }),
    prisma.whatsAppListingExtraction.count({ where: { reviewStatus: "AUTO_PUBLISHED", createdAt: { gte: dayAgo }, inboundMessage: { account: { userId: ownerUserId, archivedAt: null } } } }),
    prisma.whatsAppListingExtraction.count({ where: { reviewStatus: "PENDING_REVIEW", inboundMessage: { account: { userId: ownerUserId, archivedAt: null } } } }),
    prisma.whatsAppListingExtraction.count({ where: { reviewStatus: "DUPLICATE", createdAt: { gte: dayAgo }, inboundMessage: { account: { userId: ownerUserId, archivedAt: null } } } }),
    prisma.whatsAppInboundMessage.count({ where: { status: "FAILED", createdAt: { gte: dayAgo }, account: { userId: ownerUserId, archivedAt: null } } }),
    prisma.whatsAppIngestionAuditLog.count({ where: { action: "inbound.pipeline.failed", createdAt: { gte: dayAgo }, inboundMessage: { account: { userId: ownerUserId, archivedAt: null } } } }),
    prisma.marketplaceDemandMatch.count({ where: { createdAt: { gte: dayAgo }, request: { ownerUserId } } }),
    prisma.notificationDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: dayAgo } }, _count: { _all: true } }),
    prisma.whatsAppGroup.count({ where: { ingestionEnabled: true, account: { userId: ownerUserId, status: "CONNECTED", archivedAt: null }, OR: [{ lastInboundMessageAt: null }, { lastInboundMessageAt: { lt: staleBefore } }] } }),
    prisma.whatsAppInboundMessage.findFirst({ where: { status: { in: ["RECEIVED", "PROCESSING"] }, account: { userId: ownerUserId, archivedAt: null } }, select: { receivedAt: true }, orderBy: { receivedAt: "asc" } }),
    prisma.whatsAppInboundMessage.findMany({ where: { processedAt: { not: null }, receivedAt: { gte: hourAgo }, account: { userId: ownerUserId, archivedAt: null } }, select: { receivedAt: true, processedAt: true }, take: 2_000 }),
    prisma.whatsAppInboundMessage.count({ where: { lastErrorCode: { startsWith: "LOGIVYA_AI_" }, updatedAt: { gte: dayAgo }, account: { userId: ownerUserId, archivedAt: null } } }),
    prisma.whatsAppInboundMessage.findFirst({ where: { processedAt: { not: null }, account: { userId: ownerUserId, archivedAt: null } }, select: { processedAt: true }, orderBy: { processedAt: "desc" } }),
    prisma.whatsAppAccount.findFirst({ where: { userId: ownerUserId, archivedAt: null, lastConnectedAt: { not: null } }, select: { lastConnectedAt: true }, orderBy: { lastConnectedAt: "desc" } }),
    readWhatsAppIngestionHeartbeat().catch(() => null),
  ]);
  const durations = recentDurations
    .map((row) => row.processedAt ? row.processedAt.getTime() - row.receivedAt.getTime() : null)
    .filter((value): value is number => value != null && value >= 0)
    .sort((a, b) => a - b);
  const sent = notificationDeliveries.find((row) => row.status === "SENT")?._count._all ?? 0;
  const deliveryTotal = notificationDeliveries.reduce((sum, row) => sum + row._count._all, 0);
  return {
    control,
    connectedAccounts,
    activeGroups,
    messagesLastHour,
    logisticsListings,
    autoPublished,
    pendingReview,
    duplicates,
    failedAiRequests,
    failedJobs: failures,
    deadLetterCount: deadLetters,
    generatedMatches,
    notificationDeliverySuccessRate: deliveryTotal ? Math.round((sent / deliveryTotal) * 10_000) / 100 : null,
    staleConnectionAlerts: staleGroups,
    queueLagMs: oldestPending ? now.getTime() - oldestPending.receivedAt.getTime() : 0,
    averageProcessingLatencyMs: average(durations),
    p95ProcessingLatencyMs: percentile(durations, 0.95),
    worker: {
      healthy: isWhatsAppIngestionHeartbeatFresh(workerHeartbeat),
      status: workerHeartbeat?.status ?? "OFFLINE",
      workerId: workerHeartbeat?.workerId ?? null,
      currentJobs: workerHeartbeat?.currentJobs ?? 0,
      capacity: workerHeartbeat?.capacity ?? 0,
      lastHeartbeatAt: workerHeartbeat?.lastHeartbeatAt ?? null,
      lastSuccessfulEventAt: workerHeartbeat?.lastSuccessfulEventAt ?? lastSuccessfulMessage?.processedAt?.toISOString() ?? null,
    },
    lastSuccessfulEventAt: lastSuccessfulMessage?.processedAt?.toISOString() ?? null,
    lastReconnectAt: lastConnectedAccount?.lastConnectedAt?.toISOString() ?? null,
    generatedAt: now.toISOString(),
  };
}

export async function listWhatsAppIngestionReview(input: {
  ownerUserId: string;
  status?: WhatsAppIngestionStatus;
  limit?: number;
  cursor?: string;
}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const rows = await prisma.whatsAppListingExtraction.findMany({
    where: {
      reviewStatus: input.status ?? "PENDING_REVIEW",
      inboundMessage: { account: { userId: input.ownerUserId, archivedAt: null } },
    },
    select: {
      id: true,
      listingType: true,
      title: true,
      routeDescription: true,
      confidenceScore: true,
      missingCriticalFields: true,
      reviewStatus: true,
      createdAt: true,
      inboundMessage: {
        select: {
          sourceMessageTimestamp: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { review: page, pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } };
}

export async function getWhatsAppIngestionReview(id: string, ownerUserId: string) {
  const row = await prisma.whatsAppListingExtraction.findFirst({
    where: { id, inboundMessage: { account: { userId: ownerUserId, archivedAt: null } } },
    include: {
      inboundMessage: {
        include: {
          group: { select: { id: true, name: true, externalGroupId: true } },
          attachments: { select: { id: true, kind: true, mimeType: true, fileName: true, fileSize: true, processedAt: true } },
        },
      },
    },
  });
  if (!row) throw new Error("WHATSAPP_INGESTION_REVIEW_NOT_FOUND");
  const rawMessage = row.inboundMessage.rawTextEncrypted ? decryptPrivateValue(row.inboundMessage.rawTextEncrypted) : null;
  const publicContactPhone = row.normalizedPhoneEncrypted ? decryptPrivateValue(row.normalizedPhoneEncrypted) : null;
  const similar = await prisma.whatsAppListingExtraction.findMany({
    where: {
      id: { not: row.id },
      semanticFingerprint: row.semanticFingerprint,
      inboundMessage: { account: { userId: ownerUserId, archivedAt: null } },
    },
    select: { id: true, reviewStatus: true, publishedListingKind: true, publishedListingId: true, createdAt: true },
    take: 20,
    orderBy: { createdAt: "desc" },
  });
  const review = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "normalizedPhoneEncrypted" && key !== "inboundMessage"));
  const safeInboundMessage = Object.fromEntries(Object.entries(row.inboundMessage).filter(([key]) => key !== "rawTextEncrypted"));
  return { ...review, inboundMessage: safeInboundMessage, publicContactPhone, rawMessage, similar };
}

export async function resolveWhatsAppIngestionReview(input: {
  id: string;
  actorUserId: string;
  status: "REJECTED" | "DUPLICATE";
  note: string;
}) {
  const current = await prisma.whatsAppListingExtraction.findFirst({
    where: {
      id: input.id,
      inboundMessage: { account: { userId: input.actorUserId, archivedAt: null } },
    },
    select: { id: true, inboundMessageId: true },
  });
  if (!current) throw new Error("WHATSAPP_INGESTION_REVIEW_NOT_FOUND");
  const updated = await prisma.whatsAppListingExtraction.update({
    where: { id: input.id },
    data: { reviewStatus: input.status, reviewedById: input.actorUserId, reviewedAt: new Date(), reviewNote: input.note.slice(0, 1_000) },
  });
  await prisma.whatsAppIngestionAuditLog.create({
    data: { inboundMessageId: current.inboundMessageId, actorUserId: input.actorUserId, action: `ingestion.review.${input.status.toLowerCase()}`, status: input.status, metadata: { extractionId: input.id, note: input.note.slice(0, 500) } },
  });
  return updated;
}

export async function updateWhatsAppIngestionReviewFields(input: {
  id: string;
  primarySector?: Exclude<LogisticsSectorClassification, "UNKNOWN" | "NON_LOGISTICS">;
  marketplaceScopes?: MarketplaceScope[];
  title?: string | null;
  normalizedDescription?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  cargoType?: string | null;
  tonnageMin?: number | null;
  tonnageMax?: number | null;
  trailerType?: "CURTAINSIDER" | "OPEN_TRAILER" | "CLOSED_TRAILER" | "REFRIGERATED" | "CONTAINER" | "LOWBED" | "TRUCK" | "VAN" | "OTHER" | null;
  loadingDate?: string | null;
  freightAmount?: number | null;
  freightCurrency?: string | null;
  publicContactPhone?: string | null;
  driverListingType?: "DRIVER_AVAILABLE" | "DRIVER_WANTED" | null;
  driverLicenseClasses?: Array<"B" | "C" | "CE" | "D" | "DE">;
  driverExperienceYears?: number | null;
  driverEmploymentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "DAILY" | null;
  driverInternationalExperience?: boolean;
  driverAdrCertificate?: boolean;
  driverSrcCertificate?: boolean;
  driverPsychotechnicalCertificate?: boolean;
  actorUserId: string;
}) {
  const current = await prisma.whatsAppListingExtraction.findFirst({
    where: {
      id: input.id,
      inboundMessage: { account: { userId: input.actorUserId, archivedAt: null } },
    },
  });
  if (!current) throw new Error("WHATSAPP_INGESTION_REVIEW_NOT_FOUND");
  if (current.reviewStatus !== "PENDING_REVIEW") throw new Error("WHATSAPP_INGESTION_REVIEW_NOT_PENDING");
  const data: Prisma.WhatsAppListingExtractionUpdateInput = {};
  if (input.primarySector !== undefined || input.marketplaceScopes !== undefined) {
    const primarySector = input.primarySector ?? current.sectorClassification;
    const marketplaceScopes = [...new Set<MarketplaceScope>(["GLOBAL", ...(input.marketplaceScopes ?? current.marketplaceScopes)])];
    validateSectorScopes(primarySector, marketplaceScopes);
    data.sectorClassification = primarySector;
    data.marketplaceScopes = { set: marketplaceScopes };
    const currentEvidence = current.sectorEvidence && typeof current.sectorEvidence === "object" && !Array.isArray(current.sectorEvidence)
      ? current.sectorEvidence as Record<string, Prisma.JsonValue>
      : {};
    data.sectorEvidence = {
      ...currentEvidence,
      adminOverride: {
        actorUserId: input.actorUserId,
        at: new Date().toISOString(),
        primarySector,
        marketplaceScopes,
      },
    } as Prisma.InputJsonObject;
  }
  if (input.title !== undefined) data.title = input.title?.trim().slice(0, 240) || null;
  if (input.normalizedDescription !== undefined) data.normalizedDescription = input.normalizedDescription?.trim().slice(0, 2_000) || null;
  if (input.originCity !== undefined) data.originCity = input.originCity?.trim().slice(0, 160) || null;
  if (input.destinationCity !== undefined) data.destinationCity = input.destinationCity?.trim().slice(0, 160) || null;
  if (input.cargoType !== undefined) data.cargoType = input.cargoType?.trim().slice(0, 160) || null;
  if (input.tonnageMin !== undefined) data.tonnageMin = input.tonnageMin == null ? null : new Prisma.Decimal(input.tonnageMin);
  if (input.tonnageMax !== undefined) data.tonnageMax = input.tonnageMax == null ? null : new Prisma.Decimal(input.tonnageMax);
  if (input.trailerType !== undefined) data.trailerType = input.trailerType;
  if (input.loadingDate !== undefined) data.loadingDate = input.loadingDate ? parseDateOnly(input.loadingDate) : null;
  if (input.freightAmount !== undefined) data.freightAmount = input.freightAmount == null ? null : new Prisma.Decimal(input.freightAmount);
  if (input.freightCurrency !== undefined) data.freightCurrency = input.freightCurrency?.trim().toUpperCase().slice(0, 3) || null;
  if (input.publicContactPhone !== undefined) data.normalizedPhoneEncrypted = input.publicContactPhone ? encryptPrivateValue(input.publicContactPhone.trim()) : null;
  const structuredPatch: Record<string, Prisma.JsonValue> = {};
  if (input.driverListingType !== undefined) structuredPatch.driverListingType = input.driverListingType;
  if (input.driverLicenseClasses !== undefined) structuredPatch.driverLicenseClasses = [...new Set(input.driverLicenseClasses)];
  if (input.driverExperienceYears !== undefined) structuredPatch.driverExperienceYears = input.driverExperienceYears;
  if (input.driverEmploymentType !== undefined) structuredPatch.driverEmploymentType = input.driverEmploymentType;
  if (input.driverInternationalExperience !== undefined) structuredPatch.driverInternationalExperience = input.driverInternationalExperience;
  if (input.driverAdrCertificate !== undefined) structuredPatch.driverAdrCertificate = input.driverAdrCertificate;
  if (input.driverSrcCertificate !== undefined) structuredPatch.driverSrcCertificate = input.driverSrcCertificate;
  if (input.driverPsychotechnicalCertificate !== undefined) structuredPatch.driverPsychotechnicalCertificate = input.driverPsychotechnicalCertificate;
  if (Object.keys(structuredPatch).length) {
    const currentStructured = current.structuredData && typeof current.structuredData === "object" && !Array.isArray(current.structuredData)
      ? current.structuredData as Record<string, Prisma.JsonValue>
      : {};
    data.structuredData = { ...currentStructured, ...structuredPatch } as Prisma.InputJsonObject;
  }
  const updated = await prisma.whatsAppListingExtraction.update({ where: { id: input.id }, data });
  await prisma.whatsAppIngestionAuditLog.create({
    data: { inboundMessageId: current.inboundMessageId, actorUserId: input.actorUserId, action: "ingestion.review.fields_updated", status: "PENDING_REVIEW", metadata: { extractionId: input.id, fields: Object.keys(data), primarySector: input.primarySector, marketplaceScopes: input.marketplaceScopes } },
  });
  return updated;
}

function validateSectorScopes(primarySector: LogisticsSectorClassification, scopes: MarketplaceScope[]) {
  if (primarySector === "UNKNOWN" || primarySector === "NON_LOGISTICS") throw new Error("WHATSAPP_INGESTION_REVIEW_SECTOR_INVALID");
  if (!scopes.includes("GLOBAL")) throw new Error("WHATSAPP_INGESTION_REVIEW_GLOBAL_SCOPE_REQUIRED");
  const specialized = scopes.filter((scope) => scope !== "GLOBAL");
  if (primarySector === "GENERAL_LOGISTICS" && specialized.length) throw new Error("WHATSAPP_INGESTION_REVIEW_SCOPE_MISMATCH");
  if (primarySector === "HOME_MOVING" && !scopes.includes("HOME_MOVING")) throw new Error("WHATSAPP_INGESTION_REVIEW_SCOPE_MISMATCH");
  if (primarySector === "PARTIAL_LOAD" && !scopes.includes("PARTIAL_LOAD")) throw new Error("WHATSAPP_INGESTION_REVIEW_SCOPE_MISMATCH");
  if (primarySector === "HEAVY_HAUL" && !scopes.includes("HEAVY_HAUL")) throw new Error("WHATSAPP_INGESTION_REVIEW_SCOPE_MISMATCH");
  if (primarySector === "MULTI_SECTOR" && specialized.length < 2) throw new Error("WHATSAPP_INGESTION_REVIEW_MULTI_SCOPE_REQUIRED");
}

function safeGroupPolicySnapshot(group: { ingestionEnabled: boolean; autoPublicationEnabled: boolean; manualReviewRequired: boolean; minimumConfidence: number; sectorHint: LogisticsSourceGroupHint; ingestionPausedAt: Date | null }) {
  return {
    ingestionEnabled: group.ingestionEnabled,
    autoPublicationEnabled: group.autoPublicationEnabled,
    manualReviewRequired: group.manualReviewRequired,
    minimumConfidence: group.minimumConfidence,
    sectorHint: group.sectorHint,
    paused: Boolean(group.ingestionPausedAt),
  };
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))] ?? null;
}

function parseDateOnly(value: string) {
  const match = /^(20\d{2})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new Error("WHATSAPP_INGESTION_REVIEW_DATE_INVALID");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("WHATSAPP_INGESTION_REVIEW_DATE_INVALID");
  return date;
}
