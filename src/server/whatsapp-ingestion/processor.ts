import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type DriverEmploymentType, type DriverListingType, type LogisticsSourceGroupHint, type WhatsAppIngestionStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { matchListingAgainstDemandRequests } from "@/server/freight/demand-matching";
import { isProbableFreightMessage } from "@/server/freight/message-extraction";
import { normalizeLogisticsText } from "@/server/freight/location-normalization";
import { ingestAuthorizedFreightMessage } from "@/server/freight/smart-ingestion";
import { normalizeFreightPhone, todayFreightDate } from "@/server/freight/service";
import { automaticListingExpiry, classifyLogisticsSector } from "@/server/freight/sector-classification";
import { decryptPrivateValue, encryptPrivateValue } from "@/server/security/private-fields";
import { boundedDatabaseText } from "@/server/security/database-text";
import { extractListingsWithLogivyaAi, type LogivyaAiListing } from "@/server/whatsapp-ingestion/ai-extraction";
import {
  nextWhatsAppIngestionStage,
  type WhatsAppIngestionJob,
} from "@/server/whatsapp-ingestion/contracts";
import { enqueueWhatsAppIngestionStage } from "@/server/whatsapp-ingestion/queue";

type StageResult = { terminal?: boolean };

const PIPELINE_ACTIVE_STATUSES = [
  "RECEIVED",
  "PROCESSING",
  "PENDING_REVIEW",
  "AUTO_PUBLISHED",
] satisfies WhatsAppIngestionStatus[];

export async function processWhatsAppIngestionJob(job: WhatsAppIngestionJob, workerId: string) {
  const claimed = await prisma.whatsAppInboundMessage.updateMany({
    where: {
      id: job.inboundMessageId,
      accountId: job.accountId,
      groupId: job.groupId,
      stageVersion: job.stageVersion,
      currentStage: job.stage,
      status: { in: PIPELINE_ACTIVE_STATUSES },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(Date.now() - ingestionLockMs()) } },
        { lockedBy: workerId },
      ],
    },
    data: {
      ...(job.stage === "DEMAND_MATCHING" || job.stage === "NOTIFICATION_DELIVERY" ? {} : { status: "PROCESSING" as const }),
      lockedAt: new Date(),
      lockedBy: workerId,
      lastHeartbeatAt: new Date(),
      attemptCount: { increment: 1 },
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (!claimed.count) return { skipped: true };

  const heartbeat = setInterval(() => {
    void prisma.whatsAppInboundMessage.updateMany({
      where: { id: job.inboundMessageId, lockedBy: workerId, currentStage: job.stage, stageVersion: job.stageVersion },
      data: { lastHeartbeatAt: new Date() },
    }).catch(() => undefined);
  }, 15_000);
  heartbeat.unref?.();

  try {
    const result = await withTimeout(runStage(job), stageTimeoutMs(), `INGESTION_STAGE_TIMEOUT:${job.stage}`);
    if (result.terminal) {
      await releaseIngestionLock(job.inboundMessageId, workerId);
      return { completed: true, terminal: true };
    }

    const nextStage = nextWhatsAppIngestionStage(job.stage);
    if (nextStage === "COMPLETED") {
      await prisma.whatsAppInboundMessage.updateMany({
        where: { id: job.inboundMessageId, lockedBy: workerId, stageVersion: job.stageVersion },
        data: { currentStage: "COMPLETED", processedAt: new Date(), lockedAt: null, lockedBy: null, lastHeartbeatAt: new Date() },
      });
      return { completed: true };
    }

    const advanced = await prisma.whatsAppInboundMessage.updateMany({
      where: { id: job.inboundMessageId, lockedBy: workerId, currentStage: job.stage, stageVersion: job.stageVersion },
      data: { currentStage: nextStage, lockedAt: null, lockedBy: null, lastHeartbeatAt: new Date(), nextAttemptAt: new Date() },
    });
    if (!advanced.count) return { skipped: true };
    await enqueueWhatsAppIngestionStage({ ...job, stage: nextStage });
    return { completed: true, nextStage };
  } catch (error) {
    await prisma.whatsAppInboundMessage.updateMany({
      where: { id: job.inboundMessageId, lockedBy: workerId, stageVersion: job.stageVersion },
      data: {
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: safeCode(error),
        lastErrorMessage: safeCode(error).slice(0, 500),
        nextAttemptAt: new Date(Date.now() + 5_000),
      },
    });
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

export async function markWhatsAppIngestionFinalFailure(job: WhatsAppIngestionJob, error: unknown) {
  const errorCode = safeCode(error);
  const updated = await prisma.whatsAppInboundMessage.updateMany({
    where: { id: job.inboundMessageId, stageVersion: job.stageVersion, status: { in: PIPELINE_ACTIVE_STATUSES } },
    data: {
      status: "FAILED",
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: errorCode,
      lastErrorMessage: errorCode.slice(0, 500),
      processedAt: new Date(),
    },
  });
  if (updated.count) {
    await prisma.$transaction([
      prisma.whatsAppGroup.update({ where: { id: job.groupId }, data: { failedMessageCount: { increment: 1 } } }),
      prisma.whatsAppIngestionAuditLog.create({
        data: {
          inboundMessageId: job.inboundMessageId,
          groupId: job.groupId,
          action: "inbound.pipeline.failed",
          stage: job.stage,
          status: "FAILED",
          metadata: { errorCode, stageVersion: job.stageVersion },
        },
      }),
    ]);
  }
}

export async function reconcilePendingWhatsAppIngestion(limit = 500) {
  const rows = await prisma.whatsAppInboundMessage.findMany({
    where: {
      status: { in: PIPELINE_ACTIVE_STATUSES },
      currentStage: { not: "COMPLETED" },
      nextAttemptAt: { lte: new Date() },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - ingestionLockMs()) } }],
    },
    select: { id: true, accountId: true, groupId: true, currentStage: true, stageVersion: true },
    orderBy: [{ nextAttemptAt: "asc" }, { receivedAt: "asc" }],
    take: Math.min(2_000, Math.max(1, limit)),
  });
  let enqueued = 0;
  for (const row of rows) {
    if (row.currentStage === "COMPLETED") continue;
    await enqueueWhatsAppIngestionStage({
      inboundMessageId: row.id,
      accountId: row.accountId,
      groupId: row.groupId,
      stage: row.currentStage,
      stageVersion: row.stageVersion,
      correlationId: `ing-recovery-${row.id}`,
    });
    enqueued += 1;
  }
  return { scanned: rows.length, enqueued };
}

export async function enforceWhatsAppIngestionRetention() {
  const now = new Date();
  const reviewCutoff = new Date(now.getTime() - 14 * 86_400_000);
  const [rawMessages, attachments, expiredReview, expiredLoads, expiredVehicles, expiredDrivers] = await prisma.$transaction([
    prisma.whatsAppInboundMessage.updateMany({
      where: { rawExpiresAt: { lte: now }, rawTextEncrypted: { not: null } },
      data: { rawTextEncrypted: null, normalizedText: null, senderPhoneEncrypted: null, senderDisplayNameEncrypted: null },
    }),
    prisma.whatsAppInboundAttachment.updateMany({
      where: { expiresAt: { lte: now }, OR: [{ captionEncrypted: { not: null } }, { fileName: { not: null } }] },
      data: { captionEncrypted: null, fileName: null },
    }),
    prisma.whatsAppListingExtraction.updateMany({
      where: { reviewStatus: "PENDING_REVIEW", createdAt: { lt: reviewCutoff } },
      data: { reviewStatus: "EXPIRED", reviewNote: "MANUAL_REVIEW_RETENTION_EXPIRED" },
    }),
    prisma.freightListing.updateMany({
      where: { source: "WHATSAPP", status: "ACTIVE", expiresAt: { lte: now } },
      data: { status: "INACTIVE", deactivatedAt: now },
    }),
    prisma.vehicleListing.updateMany({
      where: { source: "WHATSAPP", status: "ACTIVE", expiresAt: { lte: now } },
      data: { status: "INACTIVE", deactivatedAt: now },
    }),
    prisma.driverListing.updateMany({
      where: { source: "WHATSAPP", status: "ACTIVE", expiresAt: { lte: now } },
      data: { status: "INACTIVE", deactivatedAt: now },
    }),
  ]);
  return {
    rawMessagesRedacted: rawMessages.count,
    attachmentsRedacted: attachments.count,
    reviewsExpired: expiredReview.count,
    listingsExpired: expiredLoads.count + expiredVehicles.count + expiredDrivers.count,
  };
}

async function runStage(job: WhatsAppIngestionJob): Promise<StageResult> {
  switch (job.stage) {
    case "WHATSAPP_INBOUND":
      return auditStage(job, "inbound.pipeline.started");
    case "CONTENT_NORMALIZATION":
      return normalizeContent(job);
    case "MEDIA_PROCESSING":
      return processAttachmentMetadata(job);
    case "AI_CLASSIFICATION":
      return classifyContent(job);
    case "STRUCTURED_EXTRACTION":
      return extractStructuredListings(job);
    case "LOCATION_NORMALIZATION":
      return auditStage(job, "inbound.locations.normalized");
    case "PHONE_NORMALIZATION":
      return auditStage(job, "inbound.phones.normalized");
    case "DUPLICATE_DETECTION":
      return detectDuplicates(job);
    case "LISTING_PUBLICATION":
      return publishEligibleListings(job);
    case "DEMAND_MATCHING":
      return matchPublishedListings(job);
    case "NOTIFICATION_DELIVERY":
      return finalizePipeline(job);
    default:
      return { terminal: true };
  }
}

async function normalizeContent(job: WhatsAppIngestionJob): Promise<StageResult> {
  const row = await readMessage(job.inboundMessageId);
  const raw = decryptRawText(row.rawTextEncrypted);
  const normalizedText = normalizeLogisticsText(raw).slice(0, 12_000);
  if (isIgnoredConversation(normalizedText)) {
    await markTerminal(job, "REJECTED", "inbound.content.ignored", { reason: "NON_LISTING_CONVERSATION" });
    return { terminal: true };
  }
  await prisma.whatsAppInboundMessage.update({ where: { id: row.id }, data: { normalizedText, sourceLanguage: detectLanguage(raw) } });
  return auditStage(job, "inbound.content.normalized");
}

async function processAttachmentMetadata(job: WhatsAppIngestionJob) {
  await prisma.whatsAppInboundAttachment.updateMany({
    where: { inboundMessageId: job.inboundMessageId, processedAt: null },
    data: { processedAt: new Date() },
  });
  return auditStage(job, "inbound.media.metadata_processed");
}

async function classifyContent(job: WhatsAppIngestionJob): Promise<StageResult> {
  const row = await prisma.whatsAppInboundMessage.findUniqueOrThrow({
    where: { id: job.inboundMessageId },
    include: {
      attachments: { select: { kind: true } },
      account: { select: { company: { select: { defaultCountry: true } } } },
      group: { select: { sectorHint: true } },
    },
  });
  const senderDisplayName = decryptOptionalPrivateValue(row.senderDisplayNameEncrypted);
  const senderPhoneEncrypted = row.senderPhoneEncrypted;
  const raw = decryptRawText(row.rawTextEncrypted);
  if (!isProbableFreightMessage(raw)) {
    await prisma.whatsAppListingExtraction.upsert({
      where: { inboundMessageId_extractionIndex: { inboundMessageId: row.id, extractionIndex: 0 } },
      create: {
        inboundMessageId: row.id,
        extractionIndex: 0,
        listingType: "NON_LOGISTICS",
        isLogisticsListing: false,
        sourceLanguage: row.sourceLanguage,
        confidenceScore: 100,
        structuredData: { isLogisticsListing: false, listingType: "NON_LOGISTICS", sourceMessageId: row.providerMessageId },
        semanticFingerprint: row.contentHash,
        reviewStatus: "REJECTED",
      },
      update: { listingType: "NON_LOGISTICS", isLogisticsListing: false, reviewStatus: "REJECTED" },
    });
    await markTerminal(job, "REJECTED", "inbound.classification.non_logistics");
    return { terminal: true };
  }
  const aiResult = await extractListingsWithLogivyaAi({
    text: raw,
    sourceMessageId: row.providerMessageId,
    sourceTimestamp: row.sourceMessageTimestamp,
    defaultCountry: row.account.company.defaultCountry,
    attachmentKinds: row.attachments.map((attachment) => attachment.kind),
  });
  if (!aiResult.configured) {
    return auditStage(job, "inbound.classification.local_engine_selected", {
      provider: aiResult.provider,
      model: aiResult.model,
    });
  }
  if (!aiResult.listings.length) throw new Error("LOGIVYA_AI_EMPTY_RESPONSE");
  const logisticsListings = aiResult.listings.filter((listing) => listing.isLogisticsListing && !["NON_LOGISTICS", "UNKNOWN"].includes(listing.listingType));
  if (!logisticsListings.length) {
    const classification = aiResult.listings[0];
    await prisma.whatsAppListingExtraction.upsert({
      where: { inboundMessageId_extractionIndex: { inboundMessageId: row.id, extractionIndex: 0 } },
      create: {
        inboundMessageId: row.id,
        extractionIndex: 0,
        listingType: classification?.listingType ?? "NON_LOGISTICS",
        isLogisticsListing: false,
        sourceLanguage: classification?.sourceLanguage ?? row.sourceLanguage,
        confidenceScore: classification?.confidenceScore ?? 100,
        structuredData: { ...(classification ?? {}), extractionEngine: "LOGIVYA_AI", model: aiResult.model },
        semanticFingerprint: row.contentHash,
        reviewStatus: "REJECTED",
      },
      update: { listingType: classification?.listingType ?? "NON_LOGISTICS", isLogisticsListing: false, reviewStatus: "REJECTED" },
    });
    await markTerminal(job, "REJECTED", "inbound.classification.ai_non_logistics");
    return { terminal: true };
  }
  await persistAiExtractions(row.id, logisticsListings, aiResult.model, row.group.sectorHint, senderDisplayName, senderPhoneEncrypted);
  return auditStage(job, "inbound.classification.ai_logistics", { listingCount: logisticsListings.length, model: aiResult.model });
}

async function extractStructuredListings(job: WhatsAppIngestionJob): Promise<StageResult> {
  const row = await prisma.whatsAppInboundMessage.findUniqueOrThrow({
    where: { id: job.inboundMessageId },
    include: {
      group: { select: { id: true, name: true, companyId: true, sectorHint: true } },
      account: { select: { id: true, userId: true } },
      attachments: { select: { kind: true } },
    },
  });
  const aiExtractions = await prisma.whatsAppListingExtraction.count({
    where: { inboundMessageId: row.id, isLogisticsListing: true, reviewStatus: { notIn: ["EXPIRED", "DELETED_AT_SOURCE"] } },
  });
  if (aiExtractions > 0) {
    return auditStage(job, "inbound.extraction.ai_completed", { extractionCount: aiExtractions });
  }
  if (!row.account.userId) throw new Error("INGESTION_SOURCE_OWNER_MISSING");
  const raw = decryptRawText(row.rawTextEncrypted);
  const senderDisplayName = decryptOptionalPrivateValue(row.senderDisplayNameEncrypted);
  const senderPhoneEncrypted = row.senderPhoneEncrypted;
  const result = await ingestAuthorizedFreightMessage({
    sourcePlatform: "WHATSAPP",
    sourceAccountId: row.accountId,
    sourceGroupId: row.groupId,
    sourceGroupName: row.group.name,
    sourceMessageId: row.providerMessageId,
    sourceMessageTimestamp: row.sourceMessageTimestamp,
    companyId: row.group.companyId,
    ownerUserId: row.account.userId,
    text: raw,
    groupHint: row.group.sectorHint,
  });
  if (!result.persisted) {
    await markTerminal(job, "REJECTED", "inbound.extraction.empty");
    return { terminal: true };
  }
  const candidates = await prisma.freightOpportunityCandidate.findMany({
    where: {
      ownerUserId: row.account.userId,
      sourcePlatform: "WHATSAPP",
      sourceAccountId: row.accountId,
      sourceGroupId: row.groupId,
      sourceMessageId: row.providerMessageId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { opportunityIndex: "asc" },
  });
  for (const candidate of candidates) {
    const sourceSection = decryptOptionalPrivateValue(candidate.sourceTextEncrypted) ?? "";
    const partial = /(?:parsiyel|kısmi|kismi|partial|сборн|qisman|qismən|جزئي|خرده\s*بار)/iu.test(sourceSection);
    const listingType = candidate.candidateType === "LOAD" && partial ? "PARTIAL_LOAD" : candidate.candidateType;
    const missingCriticalFields = [
      !candidate.origin ? "origin" : null,
      candidate.candidateType !== "DRIVER" && !candidate.destination ? "destination" : null,
    ].filter((value): value is string => Boolean(value));
    const structuredData = {
      isLogisticsListing: true,
      listingType,
      sourceLanguage: row.sourceLanguage,
      title: listingTitle(candidate.origin, candidate.destination, listingType),
      normalizedDescription: boundedDatabaseText(sourceSection.trim(), 2_000),
      originCountry: candidate.originCountry,
      originCity: candidate.origin,
      originDistrict: null,
      originFacility: null,
      destinationCountry: candidate.destinationCountry,
      destinationCity: candidate.destination,
      destinationDistrict: null,
      destinationFacility: null,
      customsCity: candidate.customsInformation,
      routeDescription: [candidate.origin, candidate.destination].filter(Boolean).join(" → "),
      transitCountries: [],
      cargoType: candidate.cargoType,
      cargoDescription: null,
      tonnageMin: candidate.weight == null ? null : Number(candidate.weight),
      tonnageMax: candidate.weight == null ? null : Number(candidate.weight),
      volumeM3: null,
      vehicleCount: candidate.vehicleCount,
      vehicleCategory: null,
      vehicleTypeSpecified: Boolean(candidate.trailerType),
      trailerType: candidate.trailerType,
      bodyType: null,
      vehicleLength: null,
      plateCountryRequirement: null,
      loadingDate: candidate.loadingDate?.toISOString().slice(0, 10) ?? null,
      loadingStatus: null,
      readyToLoad: null,
      urgent: null,
      freightAmount: candidate.priceAmount == null ? null : Number(candidate.priceAmount),
      freightCurrency: candidate.currency,
      paymentType: null,
      contactPhone: candidate.advertisedBusinessContactEncrypted ? "ENCRYPTED_EXPLICIT_CONTACT" : null,
      contactName: senderDisplayName,
      companyName: candidate.companyName,
      notes: candidate.customsInformation,
      confidenceScore: candidate.extractionConfidence,
      missingCriticalFields,
      extractedFromText: true,
      extractedFromMedia: row.attachments.length > 0,
      sourceMessageId: row.providerMessageId,
      intent: candidate.intent,
      extractionEngine: "LOGIVYA_LOCAL_RULE_ENGINE",
      extractionModel: "logivya-local-rules-v3",
    } satisfies Record<string, unknown>;
    await prisma.whatsAppListingExtraction.upsert({
      where: { inboundMessageId_extractionIndex: { inboundMessageId: row.id, extractionIndex: candidate.opportunityIndex } },
      create: {
        inboundMessageId: row.id,
        extractionIndex: candidate.opportunityIndex,
        listingType,
        isLogisticsListing: true,
        sourceLanguage: row.sourceLanguage,
        title: structuredData.title,
        normalizedDescription: boundedDatabaseText(sourceSection.trim(), 2_000),
        originCountry: candidate.originCountry,
        originCity: candidate.origin,
        destinationCountry: candidate.destinationCountry,
        destinationCity: candidate.destination,
        routeDescription: structuredData.routeDescription,
        cargoType: candidate.cargoType,
        tonnageMin: candidate.weight,
        tonnageMax: candidate.weight,
        trailerType: candidate.trailerType,
        loadingDate: candidate.loadingDate,
        freightAmount: candidate.priceAmount,
        freightCurrency: candidate.currency,
        normalizedPhoneEncrypted: candidate.advertisedBusinessContactEncrypted ?? senderPhoneEncrypted,
        contactName: senderDisplayName,
        companyName: candidate.companyName,
        confidenceScore: candidate.extractionConfidence,
        missingCriticalFields,
        extractedFromMedia: row.attachments.length > 0,
        structuredData,
        semanticFingerprint: candidate.duplicateKey,
        reviewStatus: "PENDING_REVIEW",
        sectorClassification: candidate.primarySector,
        marketplaceScopes: candidate.marketplaceScopes,
        sectorConfidenceScore: candidate.sectorConfidenceScore,
        sectorEvidence: candidate.sectorEvidence ?? undefined,
        candidateId: candidate.id,
      },
      update: {
        listingType,
        isLogisticsListing: true,
        sourceLanguage: row.sourceLanguage,
        title: structuredData.title,
        normalizedDescription: boundedDatabaseText(sourceSection.trim(), 2_000),
        originCountry: candidate.originCountry,
        originCity: candidate.origin,
        destinationCountry: candidate.destinationCountry,
        destinationCity: candidate.destination,
        routeDescription: structuredData.routeDescription,
        cargoType: candidate.cargoType,
        tonnageMin: candidate.weight,
        tonnageMax: candidate.weight,
        trailerType: candidate.trailerType,
        loadingDate: candidate.loadingDate,
        freightAmount: candidate.priceAmount,
        freightCurrency: candidate.currency,
        normalizedPhoneEncrypted: candidate.advertisedBusinessContactEncrypted ?? senderPhoneEncrypted,
        contactName: senderDisplayName,
        companyName: candidate.companyName,
        confidenceScore: candidate.extractionConfidence,
        missingCriticalFields,
        extractedFromMedia: row.attachments.length > 0,
        structuredData,
        semanticFingerprint: candidate.duplicateKey,
        reviewStatus: "PENDING_REVIEW",
        sectorClassification: candidate.primarySector,
        marketplaceScopes: candidate.marketplaceScopes,
        sectorConfidenceScore: candidate.sectorConfidenceScore,
        sectorEvidence: candidate.sectorEvidence ?? undefined,
        candidateId: candidate.id,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        publishedAt: null,
        publishedListingKind: null,
        publishedListingId: null,
      },
    });
  }
  return auditStage(job, "inbound.extraction.local_completed", {
    extractionCount: candidates.length,
    model: "logivya-local-rules-v3",
  });
}

async function persistAiExtractions(
  inboundMessageId: string,
  listings: LogivyaAiListing[],
  model: string | null,
  groupHint: LogisticsSourceGroupHint,
  senderDisplayName: string | null,
  senderPhoneEncrypted: string | null,
) {
  for (const [index, listing] of listings.entries()) {
    const sector = classifyLogisticsSector({
      text: listing.normalizedDescription ?? listing.title ?? "",
      listingType: listing.listingType,
      trailerType: listing.trailerType,
      groupHint,
    });
    const loadingDate = listing.loadingDate ? safeIsoDate(listing.loadingDate) : null;
    const normalizedPhoneEncrypted = listing.contactPhone ? encryptPrivateValue(listing.contactPhone) : senderPhoneEncrypted;
    const structuredData = {
      ...listing,
      contactName: senderDisplayName,
      contactPhone: listing.contactPhone ? "ENCRYPTED_EXPLICIT_CONTACT" : null,
      extractionEngine: "LOGIVYA_AI",
      model,
    } satisfies Record<string, unknown>;
    const fingerprint = createHash("sha256").update([
      listing.listingType,
      listing.originCountry,
      listing.originCity,
      listing.destinationCountry,
      listing.destinationCity,
      listing.trailerType,
      listing.cargoType,
      listing.tonnageMin,
      listing.tonnageMax,
      listing.contactPhone,
      listing.freightAmount,
      listing.freightCurrency,
      listing.loadingDate,
      normalizeLogisticsText(listing.normalizedDescription ?? ""),
    ].map((value) => value ?? "?").join("|")).digest("base64url");
    await prisma.whatsAppListingExtraction.upsert({
      where: { inboundMessageId_extractionIndex: { inboundMessageId, extractionIndex: index } },
      create: {
        inboundMessageId,
        extractionIndex: index,
        listingType: listing.listingType,
        isLogisticsListing: listing.isLogisticsListing,
        sourceLanguage: listing.sourceLanguage,
        title: listing.title,
        normalizedDescription: listing.normalizedDescription,
        originCountry: listing.originCountry,
        originCity: listing.originCity,
        destinationCountry: listing.destinationCountry,
        destinationCity: listing.destinationCity,
        routeDescription: listing.routeDescription,
        cargoType: listing.cargoType,
        tonnageMin: listing.tonnageMin,
        tonnageMax: listing.tonnageMax,
        trailerType: listing.trailerType,
        loadingDate,
        freightAmount: listing.freightAmount,
        freightCurrency: listing.freightCurrency,
        normalizedPhoneEncrypted,
        contactName: senderDisplayName,
        companyName: listing.companyName,
        confidenceScore: listing.confidenceScore,
        missingCriticalFields: listing.missingCriticalFields,
        extractedFromMedia: listing.extractedFromMedia,
        structuredData,
        semanticFingerprint: fingerprint,
        reviewStatus: "PENDING_REVIEW",
        sectorClassification: sector.primarySector,
        marketplaceScopes: sector.marketplaceScopes,
        sectorConfidenceScore: sector.confidence,
        sectorEvidence: { ...sector, groupHint },
      },
      update: {
        listingType: listing.listingType,
        isLogisticsListing: listing.isLogisticsListing,
        sourceLanguage: listing.sourceLanguage,
        title: listing.title,
        normalizedDescription: listing.normalizedDescription,
        originCountry: listing.originCountry,
        originCity: listing.originCity,
        destinationCountry: listing.destinationCountry,
        destinationCity: listing.destinationCity,
        routeDescription: listing.routeDescription,
        cargoType: listing.cargoType,
        tonnageMin: listing.tonnageMin,
        tonnageMax: listing.tonnageMax,
        trailerType: listing.trailerType,
        loadingDate,
        freightAmount: listing.freightAmount,
        freightCurrency: listing.freightCurrency,
        normalizedPhoneEncrypted,
        contactName: senderDisplayName,
        companyName: listing.companyName,
        confidenceScore: listing.confidenceScore,
        missingCriticalFields: listing.missingCriticalFields,
        extractedFromMedia: listing.extractedFromMedia,
        structuredData,
        semanticFingerprint: fingerprint,
        reviewStatus: "PENDING_REVIEW",
        sectorClassification: sector.primarySector,
        marketplaceScopes: sector.marketplaceScopes,
        sectorConfidenceScore: sector.confidence,
        sectorEvidence: { ...sector, groupHint },
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        publishedAt: null,
        publishedListingKind: null,
        publishedListingId: null,
      },
    });
  }
}

async function detectDuplicates(job: WhatsAppIngestionJob): Promise<StageResult> {
  const extractions = await prisma.whatsAppListingExtraction.findMany({
    where: { inboundMessageId: job.inboundMessageId, isLogisticsListing: true },
    orderBy: { extractionIndex: "asc" },
  });
  let duplicates = 0;
  for (const extraction of extractions) {
    const existing = await prisma.whatsAppListingExtraction.findFirst({
      where: {
        id: { not: extraction.id },
        semanticFingerprint: extraction.semanticFingerprint,
        reviewStatus: { in: ["PENDING_REVIEW", "AUTO_PUBLISHED", "MANUALLY_PUBLISHED"] },
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!existing) continue;
    await prisma.whatsAppListingExtraction.update({
      where: { id: extraction.id },
      data: { reviewStatus: "DUPLICATE", reviewNote: `DUPLICATE_OF:${existing.id}` },
    });
    duplicates += 1;
  }
  if (extractions.length > 0 && duplicates === extractions.length) {
    await markTerminal(job, "DUPLICATE", "inbound.duplicate.detected", { duplicates });
    return { terminal: true };
  }
  return auditStage(job, "inbound.duplicate.checked", { duplicates });
}

async function publishEligibleListings(job: WhatsAppIngestionJob) {
  const message = await prisma.whatsAppInboundMessage.findUniqueOrThrow({
    where: { id: job.inboundMessageId },
    include: {
      group: true,
      account: { select: { userId: true, company: { select: { defaultCountry: true, defaultCurrency: true } } } },
      extractions: { where: { reviewStatus: "PENDING_REVIEW" }, orderBy: { extractionIndex: "asc" } },
    },
  });
  if (!message.account.userId) throw new Error("INGESTION_SOURCE_OWNER_MISSING");
  const autoAllowed = message.group.autoPublicationEnabled && !message.group.manualReviewRequired;
  let published = 0;
  for (const extraction of message.extractions) {
    const complete = publicationMissingFields(extraction).length === 0;
    const extractionVerified = extractionEngineAllowsAutomaticPublication(extraction.structuredData);
    if (!autoAllowed || !complete || !extractionVerified || extraction.confidenceScore < message.group.minimumConfidence) continue;
    try {
      const publishedListing = await publishExtraction({
        extraction,
        ownerUserId: message.account.userId,
        companyId: message.group.companyId,
        defaultCountry: message.account.company.defaultCountry,
        defaultCurrency: message.account.company.defaultCurrency,
        sourceTimestamp: message.sourceMessageTimestamp,
      });
      if (publishedListing) published += 1;
    } catch (error) {
      // A permanent content validation error needs correction, not repeated delivery attempts.
      if (!(error instanceof Error) || error.message !== "FREIGHT_INVALID_PHONE") throw error;
      await prisma.whatsAppListingExtraction.update({
        where: { id: extraction.id },
        data: { reviewStatus: "PENDING_REVIEW", reviewNote: "FREIGHT_INVALID_PHONE" },
      });
      await auditStage(job, "inbound.publication.review_required", { reason: "FREIGHT_INVALID_PHONE", extractionIndex: extraction.extractionIndex });
    }
  }
  const remaining = await prisma.whatsAppListingExtraction.count({
    where: { inboundMessageId: message.id, reviewStatus: "PENDING_REVIEW" },
  });
  await prisma.whatsAppInboundMessage.update({
    where: { id: message.id },
    data: { status: remaining ? "PENDING_REVIEW" : published ? "AUTO_PUBLISHED" : "PENDING_REVIEW" },
  });
  if (published) {
    await prisma.whatsAppGroup.update({
      where: { id: message.groupId },
      data: { publishedListingCount: { increment: published }, lastPublishedListingAt: new Date() },
    });
  }
  return auditStage(job, "inbound.publication.evaluated", { published, pendingReview: remaining });
}

async function matchPublishedListings(job: WhatsAppIngestionJob) {
  const extractions = await prisma.whatsAppListingExtraction.findMany({
    where: { inboundMessageId: job.inboundMessageId, publishedListingKind: { not: null }, publishedListingId: { not: null } },
    select: { publishedListingKind: true, publishedListingId: true },
  });
  for (const extraction of extractions) {
    if (!extraction.publishedListingKind || !extraction.publishedListingId) continue;
    await matchListingAgainstDemandRequests(extraction.publishedListingKind, extraction.publishedListingId);
  }
  return auditStage(job, "inbound.demand_matching.completed", { listingCount: extractions.length });
}

async function finalizePipeline(job: WhatsAppIngestionJob): Promise<StageResult> {
  const message = await prisma.whatsAppInboundMessage.findUniqueOrThrow({ where: { id: job.inboundMessageId }, select: { status: true } });
  await prisma.$transaction([
    prisma.whatsAppInboundMessage.update({
      where: { id: job.inboundMessageId },
      data: { currentStage: "COMPLETED", processedAt: new Date(), lockedAt: null, lockedBy: null },
    }),
    prisma.whatsAppGroup.update({ where: { id: job.groupId }, data: { processedMessageCount: { increment: 1 } } }),
    prisma.whatsAppIngestionAuditLog.create({
      data: {
        inboundMessageId: job.inboundMessageId,
        groupId: job.groupId,
        action: "inbound.pipeline.completed",
        stage: "NOTIFICATION_DELIVERY",
        status: message.status,
      },
    }),
  ]);
  return { terminal: true };
}

async function publishExtraction(input: {
  extraction: Prisma.WhatsAppListingExtractionGetPayload<Record<string, never>>;
  ownerUserId: string;
  companyId: string;
  defaultCountry: string;
  defaultCurrency: string;
  sourceTimestamp: Date;
  publicationStatus?: "AUTO_PUBLISHED" | "MANUALLY_PUBLISHED";
}) {
  const { extraction } = input;
  if (extraction.publishedListingId) return extraction.publishedListingId;
  const phone = extraction.normalizedPhoneEncrypted
    ? normalizeFreightPhone(decryptPrivateValue(extraction.normalizedPhoneEncrypted), input.defaultCountry)
    : null;
  if (!phone) return null;
  const description = extraction.normalizedDescription ? boundedDatabaseText(extraction.normalizedDescription, 2_000) : null;
  const effectiveListingDate = extraction.loadingDate;
  const expiresAt = automaticListingExpiry(input.sourceTimestamp, Boolean(extraction.loadingDate));
  if (extraction.listingType === "LOAD" || extraction.listingType === "PARTIAL_LOAD") {
    if (!extraction.originCity || !extraction.destinationCity || !extraction.tonnageMin || !extraction.trailerType) return null;
    const listing = await prisma.freightListing.upsert({
      where: { sourceExtractionId: extraction.id },
      create: {
        companyId: input.companyId,
        ownerUserId: input.ownerUserId,
        source: "WHATSAPP",
        sourceExtractionId: extraction.id,
        primarySector: extraction.sectorClassification,
        marketplaceScopes: extraction.marketplaceScopes,
        sectorDetails: extraction.sectorEvidence ?? undefined,
        isPartialLoad: extraction.listingType === "PARTIAL_LOAD",
        origin: extraction.originCity,
        originNormalized: normalizeLogisticsText(extraction.originCity),
        destination: extraction.destinationCity,
        destinationNormalized: normalizeLogisticsText(extraction.destinationCity),
        loadingDate: effectiveListingDate,
        cargoType: extraction.cargoType,
        weight: extraction.tonnageMin,
        trailerType: extraction.trailerType,
        vehicleCount: structuredNumber(extraction.structuredData, "vehicleCount") ?? 1,
        priceAmount: extraction.freightAmount,
        currency: extraction.freightAmount ? extraction.freightCurrency || input.defaultCurrency : null,
        description,
        contactPhone: phone,
        expiresAt,
      },
      update: {
        primarySector: extraction.sectorClassification,
        marketplaceScopes: extraction.marketplaceScopes,
        sectorDetails: extraction.sectorEvidence ?? undefined,
        origin: extraction.originCity,
        originNormalized: normalizeLogisticsText(extraction.originCity),
        destination: extraction.destinationCity,
        destinationNormalized: normalizeLogisticsText(extraction.destinationCity),
        loadingDate: effectiveListingDate,
        cargoType: extraction.cargoType,
        weight: extraction.tonnageMin,
        trailerType: extraction.trailerType,
        vehicleCount: structuredNumber(extraction.structuredData, "vehicleCount") ?? 1,
        priceAmount: extraction.freightAmount,
        currency: extraction.freightAmount ? extraction.freightCurrency || input.defaultCurrency : null,
        description,
        contactPhone: phone,
        status: "ACTIVE",
        deactivatedAt: null,
        expiresAt,
      },
      select: { id: true },
    });
    await recordPublication(extraction.id, "LOAD", listing.id, extraction.structuredData, input.publicationStatus ?? "AUTO_PUBLISHED");
    return listing.id;
  }
  if (extraction.listingType === "VEHICLE") {
    if (!extraction.originCity || !extraction.trailerType) return null;
    const listing = await prisma.vehicleListing.upsert({
      where: { sourceExtractionId: extraction.id },
      create: {
        companyId: input.companyId,
        ownerUserId: input.ownerUserId,
        source: "WHATSAPP",
        sourceExtractionId: extraction.id,
        primarySector: extraction.sectorClassification,
        marketplaceScopes: extraction.marketplaceScopes,
        sectorDetails: extraction.sectorEvidence ?? undefined,
        origin: extraction.originCity,
        originNormalized: normalizeLogisticsText(extraction.originCity),
        destination: extraction.destinationCity,
        destinationNormalized: extraction.destinationCity ? normalizeLogisticsText(extraction.destinationCity) : null,
        availableFrom: effectiveListingDate,
        trailerType: extraction.trailerType,
        capacityWeight: extraction.tonnageMax,
        vehicleCount: structuredNumber(extraction.structuredData, "vehicleCount") ?? 1,
        priceAmount: extraction.freightAmount,
        currency: extraction.freightAmount ? extraction.freightCurrency || input.defaultCurrency : null,
        description,
        contactPhone: phone,
        expiresAt,
      },
      update: {
        primarySector: extraction.sectorClassification,
        marketplaceScopes: extraction.marketplaceScopes,
        sectorDetails: extraction.sectorEvidence ?? undefined,
        origin: extraction.originCity,
        originNormalized: normalizeLogisticsText(extraction.originCity),
        destination: extraction.destinationCity,
        destinationNormalized: extraction.destinationCity ? normalizeLogisticsText(extraction.destinationCity) : null,
        availableFrom: effectiveListingDate,
        trailerType: extraction.trailerType,
        capacityWeight: extraction.tonnageMax,
        vehicleCount: structuredNumber(extraction.structuredData, "vehicleCount") ?? 1,
        priceAmount: extraction.freightAmount,
        currency: extraction.freightAmount ? extraction.freightCurrency || input.defaultCurrency : null,
        description,
        contactPhone: phone,
        status: "ACTIVE",
        deactivatedAt: null,
        expiresAt,
      },
      select: { id: true },
    });
    await recordPublication(extraction.id, "VEHICLE", listing.id, extraction.structuredData, input.publicationStatus ?? "AUTO_PUBLISHED");
    return listing.id;
  }
  if (extraction.listingType === "DRIVER") {
    const listingType = structuredDriverListingType(extraction.structuredData);
    const licenseClasses = structuredStringArray(extraction.structuredData, "driverLicenseClasses").filter((value) => ["B", "C", "CE", "D", "DE"].includes(value));
    const experienceYears = structuredNonNegativeInteger(extraction.structuredData, "driverExperienceYears");
    const employmentType = structuredDriverEmploymentType(extraction.structuredData);
    if (!listingType || !extraction.originCity || !extraction.loadingDate || !licenseClasses.length || experienceYears == null || !employmentType) return null;
    const availableFrom = extraction.loadingDate < todayFreightDate() ? todayFreightDate() : extraction.loadingDate;
    const title = extraction.title ? boundedDatabaseText(extraction.title, 140) : `Şoför · ${extraction.originCity}`;
    const common = {
      listingType,
      title,
      titleNormalized: normalizeLogisticsText(title),
      location: extraction.originCity,
      locationNormalized: normalizeLogisticsText(extraction.originCity),
      preferredRoute: extraction.routeDescription,
      preferredRouteNormalized: extraction.routeDescription ? normalizeLogisticsText(extraction.routeDescription) : null,
      availableFrom,
      licenseClasses,
      experienceYears: Math.min(60, Math.max(0, Math.trunc(experienceYears))),
      employmentType,
      internationalExperience: structuredBoolean(extraction.structuredData, "driverInternationalExperience") ?? false,
      adrCertificate: structuredBoolean(extraction.structuredData, "driverAdrCertificate") ?? false,
      srcCertificate: structuredBoolean(extraction.structuredData, "driverSrcCertificate") ?? false,
      psychotechnicalCertificate: structuredBoolean(extraction.structuredData, "driverPsychotechnicalCertificate") ?? false,
      salaryAmount: extraction.freightAmount,
      currency: extraction.freightAmount ? extraction.freightCurrency || input.defaultCurrency : null,
      description,
      contactPhone: phone,
      primarySector: extraction.sectorClassification,
      marketplaceScopes: extraction.marketplaceScopes,
      sectorDetails: extraction.sectorEvidence ?? undefined,
      expiresAt,
      status: "ACTIVE" as const,
      completedAt: null,
      deactivatedAt: null,
    };
    const listing = await prisma.driverListing.upsert({
      where: { sourceExtractionId: extraction.id },
      create: { companyId: input.companyId, ownerUserId: input.ownerUserId, source: "WHATSAPP", sourceExtractionId: extraction.id, ...common },
      update: common,
      select: { id: true },
    });
    await recordPublication(extraction.id, "DRIVER", listing.id, extraction.structuredData, input.publicationStatus ?? "AUTO_PUBLISHED");
    return listing.id;
  }
  return null;
}

async function recordPublication(
  extractionId: string,
  kind: "LOAD" | "VEHICLE" | "DRIVER",
  listingId: string,
  snapshot: Prisma.JsonValue,
  publicationStatus: "AUTO_PUBLISHED" | "MANUALLY_PUBLISHED",
) {
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppListingExtraction.update({
      where: { id: extractionId },
      data: { reviewStatus: publicationStatus, publishedListingKind: kind, publishedListingId: listingId, publishedAt: new Date() },
    });
    const latest = await tx.marketplaceListingRevision.findFirst({
      where: { listingKind: kind, listingId },
      select: { revision: true },
      orderBy: { revision: "desc" },
    });
    await tx.marketplaceListingRevision.create({
      data: {
        listingKind: kind,
        listingId,
        revision: (latest?.revision ?? 0) + 1,
        sourceExtractionId: extractionId,
        reason: latest ? `SOURCE_EDIT_${publicationStatus}` : publicationStatus,
        snapshot: snapshot as Prisma.InputJsonValue,
      },
    });
  });
}

export async function publishReviewedWhatsAppExtraction(input: {
  extractionId: string;
  actorUserId: string;
  reviewNote: string;
}) {
  const extraction = await prisma.whatsAppListingExtraction.findFirst({
    where: {
      id: input.extractionId,
      inboundMessage: { account: { userId: input.actorUserId, archivedAt: null } },
    },
    include: {
      inboundMessage: {
        include: {
          group: true,
          account: { select: { userId: true, company: { select: { defaultCountry: true, defaultCurrency: true } } } },
        },
      },
    },
  });
  if (!extraction) throw new Error("WHATSAPP_INGESTION_REVIEW_NOT_FOUND");
  if (extraction.reviewStatus !== "PENDING_REVIEW") throw new Error("WHATSAPP_INGESTION_REVIEW_NOT_PENDING");
  if (!extraction.inboundMessage.account.userId) throw new Error("INGESTION_SOURCE_OWNER_MISSING");
  const missing = publicationMissingFields(extraction);
  if (missing.length) throw new Error(`WHATSAPP_INGESTION_REVIEW_INCOMPLETE:${missing.join(",")}`);
  const listingId = await publishExtraction({
    extraction,
    ownerUserId: extraction.inboundMessage.account.userId,
    companyId: extraction.inboundMessage.group.companyId,
    defaultCountry: extraction.inboundMessage.account.company.defaultCountry,
    defaultCurrency: extraction.inboundMessage.account.company.defaultCurrency,
    sourceTimestamp: extraction.inboundMessage.sourceMessageTimestamp,
    publicationStatus: "MANUALLY_PUBLISHED",
  });
  if (!listingId || !extraction.publishedListingKind) {
    const refreshed = await prisma.whatsAppListingExtraction.findUniqueOrThrow({ where: { id: extraction.id }, select: { publishedListingKind: true, publishedListingId: true } });
    if (!refreshed.publishedListingId || !refreshed.publishedListingKind) throw new Error("WHATSAPP_INGESTION_REVIEW_PUBLICATION_FAILED");
    await finalizeManualPublication(extraction.inboundMessageId, extraction.inboundMessage.groupId, extraction.id, refreshed.publishedListingKind, refreshed.publishedListingId, input.actorUserId, input.reviewNote);
    return refreshed;
  }
  const published = await prisma.whatsAppListingExtraction.findUniqueOrThrow({ where: { id: extraction.id }, select: { publishedListingKind: true, publishedListingId: true } });
  if (!published.publishedListingKind || !published.publishedListingId) throw new Error("WHATSAPP_INGESTION_REVIEW_PUBLICATION_FAILED");
  await finalizeManualPublication(extraction.inboundMessageId, extraction.inboundMessage.groupId, extraction.id, published.publishedListingKind, published.publishedListingId, input.actorUserId, input.reviewNote);
  return published;
}

async function finalizeManualPublication(
  inboundMessageId: string,
  groupId: string,
  extractionId: string,
  kind: "LOAD" | "VEHICLE" | "DRIVER",
  listingId: string,
  actorUserId: string,
  reviewNote: string,
) {
  await prisma.$transaction([
    prisma.whatsAppListingExtraction.update({ where: { id: extractionId }, data: { reviewedById: actorUserId, reviewedAt: new Date(), reviewNote: reviewNote.slice(0, 1_000) } }),
    prisma.whatsAppGroup.update({ where: { id: groupId }, data: { publishedListingCount: { increment: 1 }, lastPublishedListingAt: new Date() } }),
    prisma.whatsAppIngestionAuditLog.create({ data: { inboundMessageId, groupId, actorUserId, action: "ingestion.review.manually_published", status: "MANUALLY_PUBLISHED", metadata: { extractionId, kind, listingId } } }),
  ]);
  await matchListingAgainstDemandRequests(kind, listingId);
}

function publicationMissingFields(extraction: {
  listingType: string;
  originCity: string | null;
  destinationCity: string | null;
  loadingDate: Date | null;
  tonnageMin: Prisma.Decimal | null;
  trailerType: string | null;
  normalizedPhoneEncrypted: string | null;
  structuredData: Prisma.JsonValue;
}) {
  if (extraction.listingType === "DRIVER") return [
    !extraction.originCity ? "origin" : null,
    !extraction.loadingDate ? "loadingDate" : null,
    !extraction.normalizedPhoneEncrypted ? "publicContactPhone" : null,
    !structuredDriverListingType(extraction.structuredData) ? "driverListingType" : null,
    !structuredStringArray(extraction.structuredData, "driverLicenseClasses").length ? "driverLicenseClasses" : null,
    structuredNonNegativeInteger(extraction.structuredData, "driverExperienceYears") == null ? "driverExperienceYears" : null,
    !structuredDriverEmploymentType(extraction.structuredData) ? "driverEmploymentType" : null,
  ].filter(Boolean);
  return [
    !extraction.originCity ? "origin" : null,
    extraction.listingType !== "DRIVER" && !extraction.destinationCity ? "destination" : null,
    extraction.listingType !== "DRIVER" && !extraction.trailerType ? "trailerType" : null,
    extraction.listingType !== "VEHICLE" && !extraction.tonnageMin ? "tonnage" : null,
    !extraction.normalizedPhoneEncrypted ? "publicContactPhone" : null,
  ].filter(Boolean);
}

async function markTerminal(
  job: WhatsAppIngestionJob,
  status: "REJECTED" | "DUPLICATE",
  action: string,
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.$transaction([
    prisma.whatsAppInboundMessage.update({
      where: { id: job.inboundMessageId },
      data: { status, currentStage: "COMPLETED", processedAt: new Date(), lockedAt: null, lockedBy: null },
    }),
    prisma.whatsAppGroup.update({ where: { id: job.groupId }, data: { processedMessageCount: { increment: 1 } } }),
    prisma.whatsAppIngestionAuditLog.create({
      data: { inboundMessageId: job.inboundMessageId, groupId: job.groupId, action, stage: job.stage, status, metadata },
    }),
  ]);
}

async function auditStage(job: WhatsAppIngestionJob, action: string, metadata?: Prisma.InputJsonValue): Promise<StageResult> {
  await prisma.whatsAppIngestionAuditLog.create({
    data: { inboundMessageId: job.inboundMessageId, groupId: job.groupId, action, stage: job.stage, status: "PROCESSING", metadata },
  });
  return {};
}

async function readMessage(id: string) {
  return prisma.whatsAppInboundMessage.findUniqueOrThrow({ where: { id }, select: { id: true, providerMessageId: true, rawTextEncrypted: true, sourceLanguage: true, contentHash: true } });
}

function decryptRawText(value: string | null) {
  if (!value) throw new Error("INGESTION_RAW_TEXT_UNAVAILABLE");
  return decryptPrivateValue(value);
}

function decryptOptionalPrivateValue(value: string | null) {
  return value ? decryptPrivateValue(value) : null;
}

function isIgnoredConversation(normalized: string) {
  if (!normalized || normalized.length < 8) return true;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return true;
  if (/^(?:selam|merhaba|günaydın|gunaydin|iyi akşamlar|tesekkür|teşekkür|sağol|sagol|hello|hi|thanks|thank you)[!.\s]*$/iu.test(normalized)) return true;
  return false;
}

function detectLanguage(value: string) {
  if (/\p{Script=Arabic}/u.test(value)) return "ar";
  if (/\p{Script=Cyrillic}/u.test(value)) return "ru";
  if (/[əƏxXqQ]/u.test(value)) return "az";
  if (/[ğĞıİşŞçÇöÖüÜ]/u.test(value)) return "tr";
  return "und";
}

function listingTitle(origin: string | null, destination: string | null, type: string) {
  if (origin && destination) return `${origin} → ${destination}`;
  if (type === "DRIVER") return "Şoför ilanı";
  return "Lojistik ilanı";
}

function structuredNumber(value: Prisma.JsonValue, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? Math.max(1, Math.trunc(candidate)) : null;
}

function structuredString(value: Prisma.JsonValue, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : null;
}

function structuredBoolean(value: Prisma.JsonValue, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "boolean" ? candidate : null;
}

export function extractionEngineAllowsAutomaticPublication(value: Prisma.JsonValue) {
  const engine = structuredString(value, "extractionEngine");
  if (engine === "LOGIVYA_AI") return structuredBoolean(value, "contradictionDetected") !== true;
  return engine === "LOGIVYA_LOCAL_RULE_ENGINE"
    && structuredString(value, "extractionModel") === "logivya-local-rules-v3";
}

function structuredNonNegativeInteger(value: Prisma.JsonValue, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? Math.trunc(candidate) : null;
}

function structuredStringArray(value: Prisma.JsonValue, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];
  const candidate = (value as Record<string, unknown>)[key];
  return Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === "string") : [];
}

function structuredDriverListingType(value: Prisma.JsonValue): DriverListingType | null {
  const candidate = structuredString(value, "driverListingType");
  return candidate === "DRIVER_AVAILABLE" || candidate === "DRIVER_WANTED" ? candidate : null;
}

function structuredDriverEmploymentType(value: Prisma.JsonValue): DriverEmploymentType | null {
  const candidate = structuredString(value, "driverEmploymentType");
  return candidate === "FULL_TIME" || candidate === "PART_TIME" || candidate === "CONTRACT" || candidate === "DAILY" ? candidate : null;
}

function safeIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

async function releaseIngestionLock(id: string, workerId: string) {
  await prisma.whatsAppInboundMessage.updateMany({ where: { id, lockedBy: workerId }, data: { lockedAt: null, lockedBy: null } });
}

function ingestionLockMs() {
  return Math.min(30 * 60_000, Math.max(60_000, Number(process.env.WHATSAPP_INGESTION_LOCK_MS || 5 * 60_000)));
}

function stageTimeoutMs() {
  return Math.min(10 * 60_000, Math.max(15_000, Number(process.env.WHATSAPP_INGESTION_STAGE_TIMEOUT_MS || 120_000)));
}

function safeCode(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "WHATSAPP_INGESTION_FAILED"))
    .replace(/[^A-Za-z0-9_:.-]/gu, "_")
    .slice(0, 200);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
