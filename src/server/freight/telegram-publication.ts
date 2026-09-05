import "server-only";
import { prisma } from "@/server/db";
import { decryptPrivateValue } from "@/server/security/private-fields";
import { normalizeFreightPhone } from "./service";
import { matchListingAgainstDemandRequests } from "./demand-matching";
import { redactPublicContactDetails } from "./public-listing-summary";
import type { Prisma } from "@prisma/client";

/** Private group ingestion is never an implicit permission to publish its messages. */
export async function publishTelegramCandidates(input: { ownerUserId: string; sourceAccountId: string; sourceGroupId: string; sourceMessageId: string }) {
  const publications: Array<{ kind: "LOAD" | "VEHICLE"; id: string }> = [];
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "TelegramChat" WHERE id = ${input.sourceGroupId} FOR UPDATE`;
    const chat = await tx.telegramChat.findFirst({ where: { id: input.sourceGroupId, accountId: input.sourceAccountId, freightPublicationEnabled: true, isActive: true, isArchived: false, type: { in: ["BASIC_GROUP", "SUPERGROUP", "CHANNEL"] }, account: { ownerUserId: input.ownerUserId, archivedAt: null, status: "CONNECTED" } }, include: { account: { select: { companyId: true, company: { select: { defaultCountry: true } } } } } });
    if (!chat) return;
    const candidates = await tx.freightOpportunityCandidate.findMany({ where: { ownerUserId: input.ownerUserId, companyId: chat.companyId, sourcePlatform: "TELEGRAM", sourceAccountId: input.sourceAccountId, sourceGroupId: chat.id, sourceMessageId: input.sourceMessageId } });
    for (const candidate of candidates) {
      const sourceExtractionId = `telegram:${candidate.id}`;
      const sourceWhere = { source: "TELEGRAM" as const, sourceExtractionId, ownerUserId: input.ownerUserId };
      let phone: string | null = null;
      try { if (candidate.advertisedBusinessContactEncrypted) phone = normalizeFreightPhone(decryptPrivateValue(candidate.advertisedBusinessContactEncrypted), chat.account.company.defaultCountry); } catch { /* An unverified number is never a public call action. */ }
      const eligible = candidate.expiresAt > new Date() && candidate.extractionConfidence >= 80 && candidate.origin && candidate.destination && candidate.trailerType && phone && candidate.candidateType !== "DRIVER";
      if (!eligible) {
        const data = { status: "INACTIVE" as const, deactivatedAt: new Date() };
        await tx.freightListing.updateMany({ where: sourceWhere, data });
        await tx.vehicleListing.updateMany({ where: sourceWhere, data });
        continue;
      }
      const text = candidate.sourceTextEncrypted ? decryptPrivateValue(candidate.sourceTextEncrypted) : "";
      const common = {
        origin: candidate.origin!, originNormalized: candidate.originNormalized!, destination: candidate.destination!, destinationNormalized: candidate.destinationNormalized!,
        trailerType: candidate.trailerType!, vehicleCount: candidate.vehicleCount ?? 1,
        priceAmount: candidate.priceAmount, currency: candidate.currency, contactPhone: phone!, description: redactPublicContactDetails(text),
        primarySector: candidate.primarySector, marketplaceScopes: candidate.marketplaceScopes, sectorDetails: candidate.sectorEvidence as Prisma.InputJsonValue,
        status: "ACTIVE" as const, expiresAt: candidate.expiresAt, deactivatedAt: null,
      };
      const identity = { companyId: chat.companyId, ownerUserId: input.ownerUserId, source: "TELEGRAM" as const, sourceExtractionId, publishedAt: candidate.sourceMessageTimestamp };
      if (candidate.candidateType === "LOAD") {
        await tx.vehicleListing.updateMany({ where: sourceWhere, data: { status: "INACTIVE", deactivatedAt: new Date() } });
        const values = { ...common, loadingDate: candidate.loadingDate, weight: candidate.weight, cargoType: candidate.cargoType, customsInfo: candidate.customsInformation };
        const row = await tx.freightListing.upsert({ where: { sourceExtractionId }, create: { ...identity, ...values }, update: values });
        publications.push({ kind: "LOAD", id: row.id });
      } else {
        await tx.freightListing.updateMany({ where: sourceWhere, data: { status: "INACTIVE", deactivatedAt: new Date() } });
        const values = { ...common, availableFrom: candidate.loadingDate, capacityWeight: candidate.weight };
        const row = await tx.vehicleListing.upsert({ where: { sourceExtractionId }, create: { ...identity, ...values }, update: values });
        publications.push({ kind: "VEHICLE", id: row.id });
      }
    }
  }, { timeout: 30_000 });
  for (const listing of publications) await matchListingAgainstDemandRequests(listing.kind, listing.id);
  return { published: publications.length };
}

export async function setTelegramPublication(actor: { userId: string; companyId: string }, chatId: string, enabled: boolean) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "TelegramChat" WHERE id = ${chatId} FOR UPDATE`;
    const chat = await tx.telegramChat.findFirst({ where: { id: chatId, companyId: actor.companyId, isActive: true, isArchived: false, type: { in: ["BASIC_GROUP", "SUPERGROUP", "CHANNEL"] }, account: { ownerUserId: actor.userId, archivedAt: null } } });
    if (!chat) throw new Error("TELEGRAM_CHAT_NOT_FOUND");
    await tx.telegramChat.update({ where: { id: chat.id }, data: { freightPublicationEnabled: enabled } });
    if (enabled) await tx.freightOpportunityCandidate.updateMany({ where: { ownerUserId: actor.userId, sourcePlatform: "TELEGRAM", sourceGroupId: chat.id, expiresAt: { gt: new Date() } }, data: { matchingProcessedAt: null } });
    if (!enabled) {
      const candidates = await tx.freightOpportunityCandidate.findMany({ where: { ownerUserId: actor.userId, sourcePlatform: "TELEGRAM", sourceGroupId: chat.id }, select: { id: true } });
      const where = { ownerUserId: actor.userId, source: "TELEGRAM" as const, sourceExtractionId: { in: candidates.map(item => `telegram:${item.id}`) } };
      const data = { status: "INACTIVE" as const, deactivatedAt: new Date() };
      await tx.freightListing.updateMany({ where, data });
      await tx.vehicleListing.updateMany({ where, data });
    }
    return { id: chat.id, freightPublicationEnabled: enabled };
  });
}

export async function removeTelegramSourceMessage(accountId: string, externalChatId: string, messageIds: string[]) {
  const chat = await prisma.telegramChat.findFirst({ where: { accountId, externalChatId }, include: { account: { select: { ownerUserId: true } } } });
  if (!chat) return;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "TelegramChat" WHERE id = ${chat.id} FOR UPDATE`;
    await tx.telegramSourceDeletion.createMany({ data: messageIds.map(sourceMessageId => ({ chatId: chat.id, sourceMessageId })), skipDuplicates: true });
    const candidates = await tx.freightOpportunityCandidate.findMany({ where: { ownerUserId: chat.account.ownerUserId, sourcePlatform: "TELEGRAM", sourceAccountId: accountId, sourceGroupId: chat.id, sourceMessageId: { in: messageIds } }, select: { id: true } });
    const ids = candidates.map(item => item.id), now = new Date();
    await tx.freightOpportunityCandidate.updateMany({ where: { id: { in: ids } }, data: { expiresAt: now, matchingProcessedAt: now, sourceTextEncrypted: null, advertisedBusinessContactEncrypted: null } });
    await tx.smartMatchResult.updateMany({ where: { candidateId: { in: ids } }, data: { status: "EXPIRED", expiredAt: now } });
    const where = { ownerUserId: chat.account.ownerUserId, source: "TELEGRAM" as const, sourceExtractionId: { in: ids.map(id => `telegram:${id}`) } };
    const data = { status: "INACTIVE" as const, deactivatedAt: now, description: null };
    await tx.freightListing.updateMany({ where, data });
    await tx.vehicleListing.updateMany({ where, data });
  });
}
