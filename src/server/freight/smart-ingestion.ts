import "server-only";

import { Prisma, type LogisticsSourceGroupHint, type SmartMatchSource } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  extractFreightCandidates,
  isProbableFreightMessage,
  sourceTextHash,
} from "@/server/freight/message-extraction";
import { normalizeLogisticsText } from "@/server/freight/location-normalization";
import { logger } from "@/server/observability/logger";
import { encryptPrivateValue } from "@/server/security/private-fields";
import { classifyLogisticsSector } from "@/server/freight/sector-classification";

type AuthorizedMessageInput = {
  sourcePlatform: Exclude<SmartMatchSource, "LOGIVYA">;
  sourceAccountId: string;
  sourceGroupId: string;
  sourceGroupName: string;
  sourceMessageId: string;
  sourceMessageTimestamp: Date;
  companyId: string;
  ownerUserId: string;
  text: string;
  groupHint?: LogisticsSourceGroupHint | null;
};

export async function ingestAuthorizedFreightMessage(input: AuthorizedMessageInput) {
  const probable = isProbableFreightMessage(input.text);
  const extracted = probable ? extractFreightCandidates(input.text, input.sourceMessageTimestamp) : [];
  const prepared: Array<Prisma.FreightOpportunityCandidateUncheckedCreateInput & { opportunityIndex: number }> = [];
  let persisted = 0;
  for (const [opportunityIndex, candidate] of extracted.entries()) {
    const sector = classifyLogisticsSector({
      text: candidate.sourceExcerpt,
      listingType: candidate.candidateType,
      trailerType: candidate.trailerType,
      groupHint: input.groupHint,
    });
    const expiresAt = candidateExpiry(candidate.loadingDate, input.sourceMessageTimestamp, candidate.candidateType);
    if (expiresAt <= new Date()) continue;
    const encryptedContact = candidate.advertisedBusinessContact
      ? safelyEncrypt(candidate.advertisedBusinessContact, "business_contact")
      : null;
    const data = {
      companyId: input.companyId,
      ownerUserId: input.ownerUserId,
      sourcePlatform: input.sourcePlatform,
      sourceAccountId: input.sourceAccountId,
      sourceGroupId: input.sourceGroupId,
      sourceGroupName: input.sourceGroupName.slice(0, 240),
      sourceMessageId: input.sourceMessageId,
      opportunityIndex,
      candidateType: candidate.candidateType,
      primarySector: sector.primarySector,
      marketplaceScopes: sector.marketplaceScopes,
      sectorConfidenceScore: sector.confidence,
      sectorEvidence: { ...sector, groupHint: input.groupHint ?? "UNKNOWN" },
      intent: candidate.intent,
      origin: candidate.origin?.canonical ?? null,
      originNormalized: candidate.origin?.normalized ?? null,
      originCountry: candidate.origin?.countryCode ?? null,
      originLocationType: candidate.origin?.type ?? null,
      destination: candidate.destination?.canonical ?? null,
      destinationNormalized: candidate.destination?.normalized ?? null,
      destinationCountry: candidate.destination?.countryCode ?? null,
      destinationLocationType: candidate.destination?.type ?? null,
      loadingDate: candidate.loadingDate,
      cargoType: candidate.cargoType,
      weight: candidate.weight == null ? null : new Prisma.Decimal(candidate.weight),
      weightUnit: candidate.weight == null ? null : "METRIC_TONNE" as const,
      trailerType: candidate.trailerType,
      vehicleCount: candidate.vehicleCount,
      priceAmount: candidate.priceAmount == null ? null : new Prisma.Decimal(candidate.priceAmount),
      currency: candidate.currency,
      customsInformation: candidate.customsInformation,
      companyName: candidate.companyName,
      advertisedBusinessContactEncrypted: encryptedContact,
      sourceTextEncrypted: safelyEncrypt(candidate.sourceExcerpt, "source_text"),
      sourceTextHash: sourceTextHash(input.text),
      searchText: normalizeLogisticsText([
        candidate.origin?.canonical,
        candidate.destination?.canonical,
        candidate.cargoType,
        candidate.trailerType,
        candidate.companyName,
      ].filter(Boolean).join(" ")),
      extractionConfidence: candidate.confidence,
      duplicateKey: candidate.duplicateKey,
      sourceMessageTimestamp: input.sourceMessageTimestamp,
      expiresAt,
      rawTextExpiresAt: new Date(Date.now() + 7 * 86_400_000),
      lastSeenAt: new Date(),
      matchingProcessedAt: null,
    } satisfies Prisma.FreightOpportunityCandidateUncheckedCreateInput;

    prepared.push(data);
  }
  await prisma.$transaction(async tx => {
    // Live ingestion and demand backfill can parse the same source concurrently.
    const sourceKey = `${input.ownerUserId}:${input.sourcePlatform}:${input.sourceAccountId}:${input.sourceMessageId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sourceKey}, 0))`;
    for (const data of prepared) {
    const opportunityIndex = data.opportunityIndex;
    const unique = { ownerUserId: input.ownerUserId, sourcePlatform: input.sourcePlatform, sourceAccountId: input.sourceAccountId, sourceMessageId: input.sourceMessageId, opportunityIndex };
    const existing = await tx.freightOpportunityCandidate.findUnique({
      where: { ownerUserId_sourcePlatform_sourceAccountId_sourceMessageId_opportunityIndex: unique },
      select: { id: true, duplicateKey: true },
    });
    const updated = await tx.freightOpportunityCandidate.upsert({
      where: {
        ownerUserId_sourcePlatform_sourceAccountId_sourceMessageId_opportunityIndex: {
          ownerUserId: input.ownerUserId,
          sourcePlatform: input.sourcePlatform,
          sourceAccountId: input.sourceAccountId,
          sourceMessageId: input.sourceMessageId,
          opportunityIndex,
        },
      },
      create: data,
      update: {
        ...data,
        companyId: undefined,
        ownerUserId: undefined,
        sourcePlatform: undefined,
        sourceAccountId: undefined,
        sourceMessageId: undefined,
        opportunityIndex: undefined,
        firstSeenAt: undefined,
      },
    });
    if (existing && existing.duplicateKey !== data.duplicateKey) {
      await tx.smartMatchResult.updateMany({ where: { candidateId: updated.id, status: { in: ["NEW", "VIEWED", "SAVED"] } }, data: { status: "EXPIRED", expiredAt: new Date() } });
    }
    persisted += 1;
    }
    const obsolete = await tx.freightOpportunityCandidate.findMany({ where: {
      ownerUserId: input.ownerUserId, companyId: input.companyId, sourcePlatform: input.sourcePlatform,
      sourceAccountId: input.sourceAccountId, sourceMessageId: input.sourceMessageId,
      opportunityIndex: { notIn: prepared.map(item => item.opportunityIndex) }, expiresAt: { gt: new Date() },
    }, select: { id: true } });
    const ids = obsolete.map(item => item.id);
    if (ids.length) {
      const now = new Date();
      await tx.freightOpportunityCandidate.updateMany({ where: { id: { in: ids } }, data: { expiresAt: now, matchingProcessedAt: now } });
      await tx.smartMatchResult.updateMany({ where: { candidateId: { in: ids }, status: { in: ["NEW", "VIEWED", "SAVED"] } }, data: { status: "EXPIRED", expiredAt: now } });
    }
  }, { timeout: 30000 });
  logger.info("smart_matching.message_ingested", {
    sourcePlatform: input.sourcePlatform,
    sourceAccountId: input.sourceAccountId,
    sourceGroupId: input.sourceGroupId,
    candidatesDetected: persisted,
  });
  return { probable, persisted };
}

export async function ingestOwnedWhatsAppGroupMessage(input: {
  accountId: string;
  externalGroupId: string;
  sourceMessageId: string;
  sourceMessageTimestamp: Date;
  text: string;
}) {
  const group = await prisma.whatsAppGroup.findFirst({
    where: {
      accountId: input.accountId,
      externalGroupId: input.externalGroupId,
      isArchived: false,
      account: { id: input.accountId, archivedAt: null, userId: { not: null } },
    },
    select: {
      id: true,
      name: true,
      companyId: true,
      sectorHint: true,
      account: { select: { userId: true } },
    },
  });
  if (!group?.account.userId) return { probable: false, persisted: 0 };
  return ingestAuthorizedFreightMessage({
    sourcePlatform: "WHATSAPP",
    sourceAccountId: input.accountId,
    sourceGroupId: group.id,
    sourceGroupName: group.name,
    sourceMessageId: input.sourceMessageId,
    sourceMessageTimestamp: input.sourceMessageTimestamp,
    companyId: group.companyId,
    ownerUserId: group.account.userId,
    text: input.text,
    groupHint: group.sectorHint,
  });
}

export async function ingestOwnedTelegramGroupMessage(input: {
  accountId: string;
  externalChatId: string;
  sourceMessageId: string;
  sourceMessageTimestamp: Date;
  text: string;
}) {
  const chat = await prisma.telegramChat.findFirst({
    where: {
      accountId: input.accountId,
      externalChatId: input.externalChatId,
      type: { in: ["BASIC_GROUP", "SUPERGROUP", "CHANNEL"] },
      isActive: true,
      account: { id: input.accountId, archivedAt: null, status: "CONNECTED" },
    },
    select: {
      id: true,
      title: true,
      companyId: true,
      account: { select: { ownerUserId: true } },
    },
  });
  if (!chat) return { probable: false, persisted: 0 };
  return ingestAuthorizedFreightMessage({
    sourcePlatform: "TELEGRAM",
    sourceAccountId: input.accountId,
    sourceGroupId: chat.id,
    sourceGroupName: chat.title,
    sourceMessageId: input.sourceMessageId,
    sourceMessageTimestamp: input.sourceMessageTimestamp,
    companyId: chat.companyId,
    ownerUserId: chat.account.ownerUserId,
    text: input.text,
  });
}

export async function enforceFreightCandidateRetention() {
  const now = new Date();
  const [redacted, expiredResults] = await prisma.$transaction([
    prisma.freightOpportunityCandidate.updateMany({
      where: { rawTextExpiresAt: { lte: now }, OR: [{ sourceTextEncrypted: { not: null } }, { advertisedBusinessContactEncrypted: { not: null } }] },
      data: { sourceTextEncrypted: null, advertisedBusinessContactEncrypted: null },
    }),
    prisma.smartMatchResult.updateMany({
      where: { status: { in: ["NEW", "VIEWED", "SAVED"] }, candidate: { expiresAt: { lte: now } } },
      data: { status: "EXPIRED", expiredAt: now },
    }),
  ]);
  return { redacted: redacted.count, expiredResults: expiredResults.count };
}

function candidateExpiry(loadingDate: Date | null, sourceTimestamp: Date, kind: "LOAD" | "VEHICLE" | "DRIVER") {
  const ageLimitMs = kind === "DRIVER" ? 7 * 86_400_000 : 48 * 60 * 60_000;
  const ageExpiry = new Date(sourceTimestamp.getTime() + ageLimitMs);
  if (!loadingDate) return ageExpiry;
  const loadingExpiry = new Date(loadingDate.getTime() + 36 * 60 * 60_000);
  return loadingExpiry < ageExpiry ? loadingExpiry : ageExpiry;
}

function safelyEncrypt(value: string, purpose: string) {
  try {
    return encryptPrivateValue(value);
  } catch (error) {
    logger.warn("smart_matching.private_field_encryption_unavailable", {
      purpose,
      errorCode: error instanceof Error ? error.message : "PRIVATE_FIELD_ENCRYPTION_FAILED",
    });
    return null;
  }
}
