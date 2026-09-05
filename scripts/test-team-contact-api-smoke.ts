import { randomBytes } from "node:crypto";

import { prisma } from "../src/server/db";
import { SESSION_COOKIE } from "../src/server/auth/session";
import { hashOpaqueToken } from "../src/server/security/authentication";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalTarget(baseUrl: string) {
  const api = new URL(baseUrl);
  const database = new URL(process.env.DATABASE_URL ?? "");
  const localApi = api.hostname === "127.0.0.1" || api.hostname === "localhost";
  const localDatabase = (database.hostname === "127.0.0.1" || database.hostname === "localhost") && database.pathname.toLowerCase().includes("test");
  if (!localApi || !localDatabase) throw new Error("Refusing to run API smoke tests outside local API and test database targets.");
}

async function sessionCookie(userId: string, companyId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.userSession.create({
    data: {
      userId,
      companyId,
      sessionTokenHash: hashOpaqueToken(token),
      ipAddress: "127.0.0.1",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  return `${SESSION_COOKIE}=${token}`;
}

async function request(baseUrl: string, cookie: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { response, body };
}

async function main() {
  const baseUrl = (process.env.API_BASE_URL || "http://127.0.0.1:3107").replace(/\/$/, "");
  assertLocalTarget(baseUrl);

  const starter = await prisma.company.findFirst({
    where: { name: { startsWith: "Starter Integration" } },
    orderBy: { createdAt: "desc" },
    include: { owner: true },
  });
  const professional = await prisma.company.findFirst({
    where: { name: { startsWith: "Professional Integration" } },
    orderBy: { createdAt: "desc" },
    include: { owner: true, members: { where: { status: "ACTIVE", role: { not: "OWNER" } }, include: { user: true } } },
  });
  assert(starter && professional, "Integration fixtures must exist before API smoke tests run.");

  const starterCookie = await sessionCookie(starter.owner.id, starter.id);
  const starterTeam = await request(baseUrl, starterCookie, "/api/company/invitations");
  assert(starterTeam.response.status === 200, `Starter owner team endpoint returned ${starterTeam.response.status}.`);
  const starterSeats = starterTeam.body?.seatUsage as { limit?: number; used?: number } | undefined;
  assert(starterSeats?.limit === 2 && starterSeats.used === 1, "Starter owner must see two total seats and one active owner after member removal.");

  const starterContacts = await request(baseUrl, starterCookie, "/api/whatsapp/contacts");
  assert(starterContacts.response.status === 200, `Starter contact list endpoint returned ${starterContacts.response.status}.`);
  const starterManualContactSend = await request(baseUrl, starterCookie, "/api/campaigns", {
    method: "POST",
    body: JSON.stringify({ title: "Forbidden contact", content: "Test", groupIds: [], categoryIds: [], contactIds: ["forged-contact-id"], scheduleType: "SEND_NOW" }),
  });
  assert(!starterManualContactSend.response.ok, "A forged Starter contact target must still be rejected by validation or ownership checks.");
  assert(starterManualContactSend.body?.code !== "CONTACT_MESSAGING_REQUIRES_PROFESSIONAL", "Starter contact messaging must not be rejected by a Professional-only entitlement.");

  const professionalCookie = await sessionCookie(professional.owner.id, professional.id);
  const professionalContacts = await request(baseUrl, professionalCookie, "/api/whatsapp/contacts?limit=10");
  assert(professionalContacts.response.status === 200, `Professional contact endpoint returned ${professionalContacts.response.status}.`);
  const ownerContacts = professionalContacts.body?.contacts as Array<{ phone?: string; accountId?: string }> | undefined;
  assert(ownerContacts?.length === 1 && ownerContacts[0]?.phone === "905550000001", "Professional owner endpoint must return only the owner's contact.");

  const member = professional.members[0];
  assert(member, "Professional integration fixture must include an active invited member.");
  const memberAccount = await prisma.whatsAppAccount.findFirstOrThrow({ where: { companyId: professional.id, userId: member.userId } });
  const crossAccount = await request(baseUrl, professionalCookie, `/api/whatsapp/contacts?accountId=${encodeURIComponent(memberAccount.id)}`);
  assert(crossAccount.response.status !== 200, "Professional owner must not read the invited member's WhatsApp contacts by accountId.");

  const memberCookie = await sessionCookie(member.userId, professional.id);
  const memberContacts = await request(baseUrl, memberCookie, "/api/whatsapp/contacts?limit=10");
  assert(memberContacts.response.status === 200, `Professional member contact endpoint returned ${memberContacts.response.status}.`);
  const memberContactRows = memberContacts.body?.contacts as Array<{ phone?: string }> | undefined;
  assert(memberContactRows?.length === 1 && memberContactRows[0]?.phone === "905550000002", "Professional member endpoint must return only the member's contact.");
  const memberHistory = await request(baseUrl, memberCookie, "/api/messages/campaigns");
  assert(memberHistory.response.status === 200, `Professional member history endpoint returned ${memberHistory.response.status}.`);
  const memberCampaigns = memberHistory.body?.campaigns as Array<{ createdById?: string }> | undefined;
  assert(Array.isArray(memberCampaigns) && memberCampaigns.every((campaign) => campaign.createdById === member.userId), "Invited member history must not expose the owner's campaigns.");

  console.log("Local production API smoke passed: account visibility, Starter contact access, contact isolation and user-scoped history.");
}

main().finally(() => prisma.$disconnect());
