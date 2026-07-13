import { createHash, createHmac, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { prisma } from "../src/server/db";

const baseUrl = process.env.SUPPORT_TEST_BASE_URL || "http://127.0.0.1:3017";
const mobileSecret = process.env.MOBILE_JWT_SECRET || "support-integration-mobile-secret";
const userCount = Number(process.env.SUPPORT_LOAD_USERS || 100);
const listReads = Number(process.env.SUPPORT_LOAD_READS || 1000);

type LoadTicket = { id: string; publicId: string; createdById: string };
type LoadMessage = { id: string };
type LoadPayload = {
  data: {
    ticket: LoadTicket;
    tickets: LoadTicket[];
    messages: LoadMessage[];
    pageInfo: { nextCursor: string | null };
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function token(input: { userId: string; companyId: string; sessionId: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    typ: "mobile_access",
    sub: input.userId,
    companyId: input.companyId,
    sessionId: input.sessionId,
    role: "OWNER",
    iat: now,
    exp: now + 1800,
  })).toString("base64url");
  const body = `${header}.${payload}`;
  return `${body}.${createHmac("sha256", mobileSecret).update(body).digest("base64url")}`;
}

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

async function inPool<T, R>(items: T[], concurrency: number, work: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await work(items[index]!, index);
    }
  }));
  return results;
}

async function api(path: string, bearer: string, method = "GET", body?: unknown) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      Origin: baseUrl,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({})) as LoadPayload;
  return { status: response.status, payload, elapsedMs: performance.now() - startedAt };
}

async function main() {
  assert(process.env.DATABASE_URL?.includes("logivya_support_test"), "Load test refuses to run outside the isolated support database.");
  const run = Date.now().toString(36);
  const identities = Array.from({ length: userCount }, (_, index) => ({
    userId: randomUUID(),
    companyId: randomUUID(),
    sessionId: randomUUID(),
    username: `support-load-${run}-${index}`,
    email: `support-load-${run}-${index}@example.com`,
  }));

  await prisma.user.createMany({
    data: identities.map((identity) => ({
      id: identity.userId,
      name: identity.username,
      username: identity.username,
      email: identity.email,
      passwordHash: "support-load-password-not-used",
      locale: "tr",
    })),
  });
  await prisma.company.createMany({
    data: identities.map((identity, index) => ({ id: identity.companyId, name: `Support Load Tenant ${index}`, ownerId: identity.userId })),
  });
  await prisma.companyUser.createMany({
    data: identities.map((identity) => ({ companyId: identity.companyId, userId: identity.userId, role: "OWNER", status: "ACTIVE" })),
  });
  await prisma.mobileDeviceSession.createMany({
    data: identities.map((identity) => ({
      id: identity.sessionId,
      userId: identity.userId,
      companyId: identity.companyId,
      deviceId: `load-${identity.userId}`,
      platform: "ANDROID",
      refreshTokenHash: hash(`load-refresh-${identity.userId}`),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    })),
  });

  const actors = identities.map((identity) => ({ ...identity, token: token(identity) }));
  const creationResults = await inPool(actors, 25, async (actor, index) => {
    const result = await api("/api/mobile/support/tickets", actor.token, "POST", {
      subject: `Load ticket ${index}`,
      category: index % 2 ? "TECHNICAL" : "MESSAGE_DELIVERY",
      message: `Concurrent support creation payload ${index}`,
      clientMessageId: `load-create-${run}-${index}`,
      clientRequestId: `load-create-${run}-${index}`,
    });
    assert(result.status === 201, `Concurrent ticket creation ${index} failed with ${result.status}: ${JSON.stringify(result.payload)}`);
    return { ...result, ticket: result.payload.data.ticket };
  });

  const readActors = Array.from({ length: listReads }, (_, index) => actors[index % actors.length]!);
  const readResults = await inPool(readActors, 50, async (actor, index) => {
    const result = await api("/api/mobile/support/tickets?limit=20", actor.token);
    assert(result.status === 200, `Support list read ${index} failed with ${result.status}`);
    assert(result.payload.data.tickets.every((ticket) => ticket.createdById === actor.userId), `Support list read ${index} leaked another user.`);
    return result;
  });

  const replyResults = await inPool(actors, 25, async (actor, index) => {
    const ticket = creationResults[index]!.ticket;
    const result = await api(`/api/mobile/support/tickets/${encodeURIComponent(ticket.publicId)}/messages`, actor.token, "POST", {
      message: `Concurrent user reply ${index}`,
      clientMessageId: `load-reply-${run}-${index}`,
    });
    assert(result.status === 201, `Concurrent reply ${index} failed with ${result.status}: ${JSON.stringify(result.payload)}`);
    return result;
  });

  const longTicket = creationResults[0]!.ticket;
  const longMessageBase = Date.now() - 1_000_000;
  await prisma.supportTicketMessage.createMany({
    data: Array.from({ length: 1000 }, (_, index) => ({
      ticketId: longTicket.id,
      senderUserId: actors[0]!.userId,
      senderType: "USER",
      message: `Long conversation message ${index}`,
      clientMessageId: `long-${run}-${index}`,
      createdAt: new Date(longMessageBase + index),
    })),
  });
  await prisma.supportTicket.update({ where: { id: longTicket.id }, data: { lastMessageAt: new Date(), adminUnreadCount: 1002 } });

  let cursor: string | undefined;
  let pagedMessages = 0;
  const seenMessages = new Set<string>();
  do {
    const path = `/api/mobile/support/tickets/${encodeURIComponent(longTicket.publicId)}?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const result = await api(path, actors[0]!.token);
    assert(result.status === 200, `Long conversation page failed with ${result.status}`);
    for (const message of result.payload.data.messages) {
      assert(!seenMessages.has(message.id), "Conversation cursor returned a duplicate message.");
      seenMessages.add(message.id);
      pagedMessages += 1;
    }
    cursor = result.payload.data.pageInfo.nextCursor || undefined;
  } while (cursor);
  assert(pagedMessages === 1002, `Expected 1002 paginated messages, received ${pagedMessages}.`);

  const queryPlan = await prisma.$queryRawUnsafe<Array<{ "QUERY PLAN": string }>>(
    `EXPLAIN SELECT "id" FROM "SupportTicket" WHERE "createdById" = $1 ORDER BY "lastMessageAt" DESC, "id" DESC LIMIT 20`,
    actors[0]!.userId,
  );
  const plan = queryPlan.map((row) => row["QUERY PLAN"]).join("\n");
  assert(/Index(?: Only)? Scan|Bitmap Index Scan/.test(plan), `Support ticket list did not use an index:\n${plan}`);

  const creationLatency = creationResults.map((result) => result.elapsedMs);
  const readLatency = readResults.map((result) => result.elapsedMs);
  const replyLatency = replyResults.map((result) => result.elapsedMs);
  const result = {
    ok: true,
    concurrentTicketCreations: creationResults.length,
    concurrentReplies: replyResults.length,
    listReads: readResults.length,
    paginatedMessages: pagedMessages,
    crossUserLeaks: 0,
    latencyMs: {
      createP50: Math.round(percentile(creationLatency, 0.5)),
      createP95: Math.round(percentile(creationLatency, 0.95)),
      readP50: Math.round(percentile(readLatency, 0.5)),
      readP95: Math.round(percentile(readLatency, 0.95)),
      replyP50: Math.round(percentile(replyLatency, 0.5)),
      replyP95: Math.round(percentile(replyLatency, 0.95)),
    },
    indexedTicketList: true,
  };
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
