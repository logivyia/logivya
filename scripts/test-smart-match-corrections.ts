import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";
import { ingestAuthorizedFreightMessage } from "../src/server/freight/smart-ingestion";
import { persistSmartMatchResult } from "../src/server/freight/smart-matching";

async function main() {
  const original = prisma.$transaction;
  const old = { id: "candidate", duplicateKey: "incorrect-route" };
  let writes: Array<Record<string, any>> = [];
  let matches: Array<Record<string, any>> = [];
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ id: "candidate" }],
    freightOpportunityCandidate: {
      findUnique: async () => old,
      upsert: async (input: any) => { writes.push(input.create); return { ...input.create, id: "candidate" }; },
      findMany: async (input: any) => { assert.equal(input.where.ownerUserId, "owner"); assert.equal(input.where.sourceAccountId, "account"); return [{ id: "obsolete-index" }]; },
      updateMany: async (input: any) => { writes.push(input); return { count: 1 }; },
    },
    smartMatchResult: {
      updateMany: async (input: any) => { matches.push(input); return { count: 1 }; },
      findFirst: async () => null as any,
      findUnique: async () => ({ id: "old-match", status: "EXPIRED" }) as any,
      update: async (input: any) => { matches.push(input); return input; },
      create: async () => { throw Error("An expired match must reuse its unique record"); },
    },
    marketplaceDemandRequest: { update: async () => ({}) },
  };
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof prisma.$transaction;
  try {
    const input = { sourcePlatform: "WHATSAPP" as const, sourceAccountId: "account", sourceGroupId: "group", sourceGroupName: "group", sourceMessageId: "message", sourceMessageTimestamp: new Date(), companyId: "company", ownerUserId: "owner", text: "Adana Seyhan → Adana Ceyhan Tenteli 75kg" };
    assert.equal((await ingestAuthorizedFreightMessage(input)).persisted, 1);
    assert.equal(writes[0]?.destination, "Adana Ceyhan");
    assert.equal(Number(writes[0]?.weight), 0.075);
    assert(matches.some(x => x.where.candidateId === "candidate" && x.data.status === "EXPIRED"));
    assert(matches.some(x => x.where.candidateId?.in?.includes("obsolete-index")));
    writes = []; matches = [];
    assert.equal((await ingestAuthorizedFreightMessage({ ...input, text: "İlan kaldırıldı" })).persisted, 0);
    assert(writes.some(x => x.where?.id?.in?.includes("obsolete-index")), "A removed route must expire old candidates");

    const candidate = { id: "candidate", duplicateKey: "correct-route", updatedAt: new Date(), expiresAt: new Date(Date.now() + 60000), sourcePlatform: "WHATSAPP", weight: new Prisma.Decimal("0.075") } as any;
    tx.freightOpportunityCandidate.findUnique = async () => candidate;
    const demand = { id: "demand", companyId: "company", ownerUserId: "owner" } as any;
    const score = { score: 95, originScore: 100, destinationScore: 100, vehicleScore: 100, weightScore: 100, dateScore: 100, freshnessScore: 100, explanation: [] } as any;
    matches = [];
    assert.equal(await persistSmartMatchResult(demand, candidate, score, 1), true);
    assert.equal(matches[0]?.where.id, "old-match");
    assert.equal(matches[0]?.data.status, "NEW");
    assert.equal(matches[0]?.data.notifiedAt, null);
    matches = [];
    tx.smartMatchResult.findUnique = async () => ({ id: "old-match", status: "DISMISSED" });
    assert.equal(await persistSmartMatchResult(demand, candidate, score, 1), false, "A user's dismissal is preserved");
    tx.freightOpportunityCandidate.findUnique = async () => ({ ...candidate, duplicateKey: "newer-route" });
    assert.equal(await persistSmartMatchResult(demand, candidate, score, 1), false, "A stale score cannot overwrite a newly edited source");
    assert.equal(matches.length, 0);
    console.log("Source corrections, obsolete routes, kilogram precision, expired rematches and dismissal preservation: PASS");
  } finally { prisma.$transaction = original; await prisma.$disconnect(); }
}
void main();
