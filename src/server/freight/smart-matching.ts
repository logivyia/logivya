import "server-only";

import os from "node:os";
import { Prisma, type FreightOpportunityCandidate, type MarketplaceDemandRequest, type MarketplaceRequestKind, type SmartMatchSource } from "@prisma/client";

import { prisma } from "@/server/db";
import { matchDemandRequestAgainstExistingListings, matchDemandRequestAgainstListing } from "@/server/freight/demand-matching";
import { calculateSmartCandidateMatch } from "@/server/freight/smart-match-scoring";
import { emitNotificationEvent } from "@/server/notifications/engine";
import { logger } from "@/server/observability/logger";
import { callTelegramWorker } from "@/server/telegram/worker-client";

const workerId = process.env.SMART_MATCHING_WORKER_ID || `smart-matching:${os.hostname()}:${process.pid}`;
const staleLockBefore = () => new Date(Date.now() - 10 * 60_000);
const LISTING_MATCH_TRIGGER_PREFIX = "listing-v1";

export async function enqueueSmartMatchingJob(input: {
  demandId: string;
  companyId: string;
  ownerUserId: string;
  triggerKey?: string;
}) {
  return prisma.smartMatchingJob.upsert({
    where: { demandId_triggerKey: { demandId: input.demandId, triggerKey: input.triggerKey ?? "initial-v1" } },
    create: {
      demandId: input.demandId,
      companyId: input.companyId,
      ownerUserId: input.ownerUserId,
      triggerKey: input.triggerKey ?? "initial-v1",
      status: "QUEUED",
    },
    update: {},
    select: { id: true, status: true, requestedSources: true, createdAt: true },
  });
}

export async function enqueueListingMatchingJobs(kind: MarketplaceRequestKind, listingId: string) {
  const requests = await prisma.marketplaceDemandRequest.findMany({
    where: { kind, status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { id: true, companyId: true, ownerUserId: true },
    orderBy: { id: "asc" },
    take: 5_000,
  });
  if (!requests.length) return { queued: 0, eligibleRequests: 0 };
  const triggerKey = listingMatchTriggerKey(kind, listingId);
  const result = await prisma.smartMatchingJob.createMany({
    data: requests.map((request) => ({
      demandId: request.id,
      companyId: request.companyId,
      ownerUserId: request.ownerUserId,
      triggerKey,
      status: "QUEUED" as const,
    })),
    skipDuplicates: true,
  });
  return { queued: result.count, eligibleRequests: requests.length };
}

export async function processPendingSmartMatchingJobs(limit = 5) {
  const pending = await prisma.smartMatchingJob.findMany({
    where: {
      nextAttemptAt: { lte: new Date() },
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", lockedAt: { lt: staleLockBefore() } },
      ],
    },
    select: { id: true },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(20, Math.max(1, limit)),
  });
  let completed = 0;
  let failed = 0;
  for (const row of pending) {
    const claimed = await prisma.smartMatchingJob.updateMany({
      where: {
        id: row.id,
        OR: [{ status: "QUEUED" }, { status: "RUNNING", lockedAt: { lt: staleLockBefore() } }],
      },
      data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, startedAt: new Date() },
    });
    if (!claimed.count) continue;
    try {
      await executeSmartMatchingJob(row.id);
      completed += 1;
    } catch (error) {
      failed += 1;
      await failSmartMatchingJob(row.id, error);
    }
  }
  return { claimed: pending.length, completed, failed };
}

export async function processPendingFreightCandidates(limit = 50) {
  const candidates = await prisma.freightOpportunityCandidate.findMany({
    where: { matchingProcessedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ sourceMessageTimestamp: "asc" }, { id: "asc" }],
    take: Math.min(250, Math.max(1, limit)),
  });
  let matches = 0;
  for (const candidate of candidates) {
    const demands = await prisma.marketplaceDemandRequest.findMany({
      where: {
        ownerUserId: candidate.ownerUserId,
        companyId: candidate.companyId,
        kind: candidate.candidateType,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    for (const demand of demands) {
      const result = calculateSmartCandidateMatch(demand, candidate);
      if (!result) continue;
      if (await persistSmartMatchResult(demand, candidate, result)) matches += 1;
    }
    await prisma.freightOpportunityCandidate.updateMany({
      where: { id: candidate.id, matchingProcessedAt: null },
      data: { matchingProcessedAt: new Date() },
    });
  }
  return { candidates: candidates.length, matches };
}

export async function processPendingSmartMatchSummaryNotifications(limit = 25) {
  const debounceBefore = new Date(Date.now() - 60_000);
  const pending = await prisma.smartMatchResult.findMany({
    where: {
      notifiedAt: null,
      createdAt: { lte: debounceBefore },
      status: { in: ["NEW", "VIEWED", "SAVED"] },
      demand: { status: "ACTIVE", expiresAt: { gt: new Date() }, smartMatchingJobs: { none: { status: { in: ["QUEUED", "RUNNING"] } } } },
    },
    select: { demandId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit * 4)),
  });
  const demandIds = [...new Set(pending.map((row) => row.demandId))].slice(0, limit);
  let dispatched = 0;
  for (const demandId of demandIds) {
    const oldest = pending.find((row) => row.demandId === demandId)?.createdAt ?? new Date();
    const bucket = Math.floor(oldest.getTime() / (10 * 60_000));
    if (await dispatchDemandMatchSummary(demandId, `live-${bucket}`)) dispatched += 1;
  }
  return { claimed: demandIds.length, dispatched };
}

async function executeSmartMatchingJob(jobId: string) {
  const job = await prisma.smartMatchingJob.findUnique({
    where: { id: jobId },
    include: { demand: true },
  });
  if (!job || job.status !== "RUNNING") return;
  if (job.demand.status !== "ACTIVE" || job.demand.expiresAt <= new Date()) {
    await prisma.smartMatchingJob.update({ where: { id: jobId }, data: { status: "CANCELLED", completedAt: new Date(), lockedAt: null, lockedBy: null } });
    return;
  }

  const listingTrigger = parseListingMatchTrigger(job.triggerKey);
  if (listingTrigger) {
    const result = await matchDemandRequestAgainstListing(job.demandId, listingTrigger.kind, listingTrigger.listingId);
    await prisma.smartMatchingJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedSources: ["LOGIVYA"],
        matchesFound: result.matched,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    logger.info("smart_matching.listing_job_completed", {
      jobId: job.id,
      demandId: job.demandId,
      listingKind: listingTrigger.kind,
      listingId: listingTrigger.listingId,
      matchesFound: result.matched,
      notificationsDispatched: result.notified,
    });
    return;
  }

  const availableSources = await resolveAvailableSources(job.ownerUserId);
  await prisma.smartMatchingJob.update({ where: { id: jobId }, data: { requestedSources: availableSources } });
  const completedSources: SmartMatchSource[] = [];
  const errors: Array<{ source: SmartMatchSource; code: string }> = [];
  let matchesFound = 0;
  let duplicatesRemoved = 0;
  let groupsProcessed = 0;
  let messagesAnalyzed = 0;
  let candidatesDetected = 0;

  try {
    const marketplace = await matchDemandRequestAgainstExistingListings(job.demandId, { notify: false });
    matchesFound += marketplace.matched;
    completedSources.push("LOGIVYA");
  } catch (error) {
    errors.push({ source: "LOGIVYA", code: safeCode(error) });
  }

  const externalSources = availableSources.filter((source): source is "WHATSAPP" | "TELEGRAM" => source !== "LOGIVYA");
  for (const source of externalSources) {
    try {
      if (source === "TELEGRAM") await refreshOwnedTelegramCandidates(job.ownerUserId);
      const result = await matchDemandAgainstExternalCandidates(job.demand, source);
      matchesFound += result.matches;
      duplicatesRemoved += result.duplicatesRemoved;
      groupsProcessed += result.groupsProcessed;
      messagesAnalyzed += result.messagesAnalyzed;
      candidatesDetected += result.candidatesDetected;
      completedSources.push(source);
    } catch (error) {
      errors.push({ source, code: safeCode(error) });
    }
  }

  const status = errors.length === 0 ? "COMPLETED" : completedSources.length ? "PARTIAL" : "FAILED";
  await prisma.smartMatchingJob.update({
    where: { id: job.id },
    data: {
      status,
      completedSources,
      groupsProcessed,
      messagesAnalyzed,
      candidatesDetected,
      matchesFound,
      duplicatesRemoved,
      errorSummary: errors.length ? errors as Prisma.InputJsonValue : Prisma.JsonNull,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (matchesFound > 0) await dispatchDemandMatchSummary(job.demandId, `job-${job.id}`, job.id);
  logger.info("smart_matching.job_completed", {
    jobId: job.id,
    demandId: job.demandId,
    status,
    sourcesCompleted: completedSources,
    matchesFound,
    duplicatesRemoved,
  });
}

function listingMatchTriggerKey(kind: MarketplaceRequestKind, listingId: string) {
  return `${LISTING_MATCH_TRIGGER_PREFIX}:${kind}:${encodeURIComponent(listingId)}`;
}

function parseListingMatchTrigger(triggerKey: string): { kind: MarketplaceRequestKind; listingId: string } | null {
  const [prefix, kind, encodedListingId, ...rest] = triggerKey.split(":");
  if (prefix !== LISTING_MATCH_TRIGGER_PREFIX || rest.length || !encodedListingId) return null;
  if (kind !== "LOAD" && kind !== "VEHICLE" && kind !== "DRIVER") return null;
  try {
    const listingId = decodeURIComponent(encodedListingId);
    return listingId ? { kind, listingId } : null;
  } catch {
    return null;
  }
}

async function refreshOwnedTelegramCandidates(ownerUserId: string) {
  const accounts = await prisma.telegramAccount.findMany({
    where: { ownerUserId, archivedAt: null, status: "CONNECTED" },
    select: { id: true },
    orderBy: { lastConnectedAt: "desc" },
    take: 5,
  });
  for (const account of accounts) {
    await callTelegramWorker(`/accounts/${account.id}/freight-backfill`, {
      body: { maxChats: 50, messagesPerChat: 50 },
      timeoutMs: 120_000,
    });
  }
}

async function matchDemandAgainstExternalCandidates(demand: MarketplaceDemandRequest, source: "WHATSAPP" | "TELEGRAM") {
  const candidates = await prisma.freightOpportunityCandidate.findMany({
    where: {
      ownerUserId: demand.ownerUserId,
      companyId: demand.companyId,
      sourcePlatform: source,
      candidateType: demand.kind,
      intent: "OFFER",
      expiresAt: { gt: new Date() },
    },
    orderBy: [{ sourceMessageTimestamp: "desc" }, { extractionConfidence: "desc" }],
    take: 1_000,
  });
  const byDuplicate = new Map<string, FreightOpportunityCandidate[]>();
  for (const candidate of candidates) byDuplicate.set(candidate.duplicateKey, [...(byDuplicate.get(candidate.duplicateKey) ?? []), candidate]);
  let matches = 0;
  for (const group of byDuplicate.values()) {
    const representative = group[0];
    if (!representative) continue;
    const score = calculateSmartCandidateMatch(demand, representative);
    if (!score) continue;
    if (await persistSmartMatchResult(demand, representative, score, group.length)) matches += 1;
  }
  return {
    matches,
    duplicatesRemoved: Math.max(0, candidates.length - byDuplicate.size),
    groupsProcessed: new Set(candidates.map((candidate) => candidate.sourceGroupId)).size,
    messagesAnalyzed: new Set(candidates.map((candidate) => `${candidate.sourceAccountId}:${candidate.sourceMessageId}`)).size,
    candidatesDetected: candidates.length,
  };
}

async function persistSmartMatchResult(
  demand: MarketplaceDemandRequest,
  candidate: FreightOpportunityCandidate,
  result: ReturnType<typeof calculateSmartCandidateMatch> & {},
  sourceCount?: number,
) {
  const actualSourceCount = sourceCount ?? await prisma.freightOpportunityCandidate.count({
    where: {
      ownerUserId: candidate.ownerUserId,
      duplicateKey: candidate.duplicateKey,
      expiresAt: { gt: new Date() },
    },
  });
  const duplicate = await prisma.smartMatchResult.findFirst({
    where: { demandId: demand.id, duplicateGroupKey: candidate.duplicateKey, status: { not: "DISMISSED" } },
    select: { id: true, sourceCount: true },
  });
  if (duplicate) {
    if (actualSourceCount > duplicate.sourceCount) {
      await prisma.smartMatchResult.update({ where: { id: duplicate.id }, data: { sourceCount: actualSourceCount } });
    }
    return false;
  }
  try {
    await prisma.$transaction([
      prisma.smartMatchResult.create({
        data: {
          demandId: demand.id,
          candidateId: candidate.id,
          companyId: demand.companyId,
          ownerUserId: demand.ownerUserId,
          sourcePlatform: candidate.sourcePlatform,
          score: result.score,
          originScore: result.originScore,
          destinationScore: result.destinationScore,
          vehicleScore: result.vehicleScore,
          weightScore: result.weightScore,
          dateScore: result.dateScore,
          freshnessScore: result.freshnessScore,
          explanation: result.explanation as Prisma.InputJsonValue,
          duplicateGroupKey: candidate.duplicateKey,
          sourceCount: Math.max(1, actualSourceCount),
        },
      }),
      prisma.marketplaceDemandRequest.update({
        where: { id: demand.id },
        data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() },
      }),
    ]);
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

async function resolveAvailableSources(ownerUserId: string): Promise<SmartMatchSource[]> {
  const [whatsApp, telegram] = await Promise.all([
    prisma.whatsAppAccount.count({ where: { userId: ownerUserId, archivedAt: null, status: "CONNECTED" } }),
    prisma.telegramAccount.count({ where: { ownerUserId, archivedAt: null, status: "CONNECTED" } }),
  ]);
  return ["LOGIVYA", ...(whatsApp ? ["WHATSAPP" as const] : []), ...(telegram ? ["TELEGRAM" as const] : [])];
}

async function dispatchDemandMatchSummary(demandId: string, triggerKey: string, jobId?: string) {
  const demand = await prisma.marketplaceDemandRequest.findUnique({
    where: { id: demandId },
    select: { id: true, companyId: true, ownerUserId: true, title: true, expiresAt: true, status: true },
  });
  if (!demand || demand.status !== "ACTIVE" || demand.expiresAt <= new Date()) return false;
  const [marketplaceCount, smartCount] = await Promise.all([
    prisma.marketplaceDemandMatch.count({ where: { requestId: demandId, notifiedAt: null, status: { not: "DISMISSED" } } }),
    prisma.smartMatchResult.count({ where: { demandId, notifiedAt: null, status: { in: ["NEW", "VIEWED", "SAVED"] } } }),
  ]);
  const count = marketplaceCount + smartCount;
  if (!count) return false;
  const event = await emitNotificationEvent({
    type: "marketplace.request_match_found",
    idempotencyKey: `smart-matching-summary:${demandId}:${triggerKey}`,
    recipients: [{ companyId: demand.companyId, userId: demand.ownerUserId }],
    companyId: demand.companyId,
    content: {
      title: `Talebinize uygun ${count} sonuç bulundu.`,
      message: "WhatsApp, Telegram ve Logivya ilanları arasından eşleşen sonuçları görüntüleyin.",
    },
    payload: { type: "smart_matching.completed", requestId: demand.id, requestTitle: demand.title, count },
    priority: "HIGH",
    channels: ["IN_APP", "ANDROID_PUSH", "IOS_PUSH", "WEB_PUSH"],
    collapseKey: `smart-matching:${demand.id}`,
    correlationId: jobId ?? demand.id,
    deepLink: `logivya://marketplace/requests/${demand.id}/matches`,
    expiresAt: demand.expiresAt,
  });
  const notifiedAt = new Date();
  await prisma.$transaction([
    prisma.marketplaceDemandMatch.updateMany({
      where: { requestId: demandId, notifiedAt: null },
      data: { notifiedAt, notificationEventId: event.event.id },
    }),
    prisma.smartMatchResult.updateMany({ where: { demandId, notifiedAt: null }, data: { notifiedAt } }),
    ...(jobId ? [prisma.smartMatchingJob.update({ where: { id: jobId }, data: { notificationEventId: event.event.id } })] : []),
  ]);
  return true;
}

async function failSmartMatchingJob(jobId: string, error: unknown) {
  const job = await prisma.smartMatchingJob.findUnique({ where: { id: jobId }, select: { retryCount: true, maxAttempts: true } });
  if (!job) return;
  const retryCount = job.retryCount + 1;
  const retryable = retryCount < job.maxAttempts;
  await prisma.smartMatchingJob.update({
    where: { id: jobId },
    data: {
      status: retryable ? "QUEUED" : "FAILED",
      retryCount,
      nextAttemptAt: new Date(Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, retryCount - 1))),
      lockedAt: null,
      lockedBy: null,
      completedAt: retryable ? null : new Date(),
      errorSummary: [{ code: safeCode(error) }] as Prisma.InputJsonValue,
    },
  });
  logger.error("smart_matching.job_failed", error, { jobId, retryCount, retryable });
}

function safeCode(error: unknown) {
  return (error instanceof Error ? error.message : "SMART_MATCHING_FAILED").replace(/[^A-Z0-9_.:-]/giu, "_").slice(0, 160);
}
