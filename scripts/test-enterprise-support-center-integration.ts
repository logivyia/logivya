import { createHmac } from "node:crypto";
import { prisma } from "../src/server/db";
import { hashOpaqueToken } from "../src/server/security/authentication";

const baseUrl = process.env.SUPPORT_TEST_BASE_URL || "http://127.0.0.1:3017";
const mobileSecret = process.env.MOBILE_JWT_SECRET || "support-integration-mobile-secret";

type JsonObject = Record<string, unknown> & {
  success: boolean;
  data: JsonObject;
  duplicate: boolean;
  ticket: JsonObject;
  tickets: JsonObject[];
  messages: JsonObject[];
  pageInfo: { hasMore: boolean; nextCursor: string };
  id: string;
  publicId: string;
  senderType: string;
  clientMessageId: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function accessToken(input: { userId: string; companyId: string; sessionId: string; role: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    typ: "mobile_access",
    sub: input.userId,
    companyId: input.companyId,
    sessionId: input.sessionId,
    role: input.role,
    iat: now,
    exp: now + 900,
  })).toString("base64url");
  const body = `${header}.${payload}`;
  const signature = createHmac("sha256", mobileSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function request(
  path: string,
  input: { method?: string; cookie?: string; bearer?: string; body?: unknown; expected: number },
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method || "GET",
    headers: {
      Accept: "application/json",
      Origin: baseUrl,
      ...(input.cookie ? { Cookie: `logivya_session=${input.cookie}` } : {}),
      ...(input.bearer ? { Authorization: `Bearer ${input.bearer}` } : {}),
      ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });
  const payload = await response.json().catch(() => ({})) as JsonObject;
  const authKind = input.bearer ? "bearer" : input.cookie ? "cookie" : "anonymous";
  assert(response.status === input.expected, `${input.method || "GET"} ${path} [${authKind}]: expected ${input.expected}, received ${response.status} (${JSON.stringify(payload)})`);
  return payload;
}

async function seedIdentity(input: { email: string; username: string; company: string }) {
  const user = await prisma.user.create({
    data: {
      name: input.username,
      username: input.username,
      email: input.email,
      passwordHash: "support-integration-password-not-used",
      locale: "tr",
    },
  });
  const company = await prisma.company.create({ data: { name: input.company, ownerId: user.id } });
  await prisma.companyUser.create({ data: { companyId: company.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });
  const webToken = `web-${input.username}-${Date.now()}`;
  await prisma.userSession.create({
    data: {
      userId: user.id,
      companyId: company.id,
      sessionTokenHash: hashOpaqueToken(webToken),
      ipAddress: "127.0.0.1",
      userAgent: "support-integration",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const mobileSession = await prisma.mobileDeviceSession.create({
    data: {
      userId: user.id,
      companyId: company.id,
      deviceId: `support-${input.username}`,
      platform: "ANDROID",
      refreshTokenHash: hashOpaqueToken(`refresh-${input.username}-${Date.now()}`),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  return {
    user,
    company,
    webToken,
    mobileToken: accessToken({ userId: user.id, companyId: company.id, sessionId: mobileSession.id, role: "OWNER" }),
  };
}

function mobileData(payload: JsonObject) {
  assert(payload.success === true && payload.data, `Expected mobile success envelope: ${JSON.stringify(payload)}`);
  return payload.data as JsonObject;
}

async function main() {
  assert(process.env.DATABASE_URL?.includes("logivya_support_test"), "Integration test refuses to run outside the isolated support database.");
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  await prisma.rateLimitEvent.deleteMany();
  const suffix = Date.now().toString(36);
  const admin = await seedIdentity({ email: "burakidim@gmail.com", username: `support-admin-${suffix}`, company: "Support Admin Workspace" });
  const user1 = await seedIdentity({ email: `support-user1-${suffix}@example.com`, username: `support-user1-${suffix}`, company: "Tenant One" });
  const user2 = await seedIdentity({ email: `support-user2-${suffix}@example.com`, username: `support-user2-${suffix}`, company: "Tenant Two" });

  await request("/api/support/tickets", { method: "POST", body: {}, expected: 401 });
  await request("/api/support/tickets", {
    method: "POST",
    cookie: user1.webToken,
    body: { subject: "Invalid category", category: "NOT_A_CATEGORY", message: "Invalid category body", clientMessageId: "invalid-category-1" },
    expected: 400,
  });

  const create1 = await request("/api/support/tickets", {
    method: "POST",
    cookie: user1.webToken,
    body: {
      subject: "Tenant one connection issue",
      category: "WHATSAPP_CONNECTION",
      message: "The pairing operation does not complete.",
      clientMessageId: "create-user1-1",
      clientRequestId: "create-user1-1",
    },
    expected: 201,
  });
  const user1Ticket = create1.ticket as JsonObject;
  assert(/^LOG-\d{4}-[A-F0-9]{20}$/.test(user1Ticket.publicId), "A secure public ticket ID was not generated.");

  const create1Retry = await request("/api/support/tickets", {
    method: "POST",
    cookie: user1.webToken,
    body: {
      subject: "Tenant one connection issue",
      category: "WHATSAPP_CONNECTION",
      message: "The pairing operation does not complete.",
      clientMessageId: "create-user1-1",
      clientRequestId: "create-user1-1",
    },
    expected: 200,
  });
  assert(create1Retry.duplicate === true && create1Retry.ticket.id === user1Ticket.id, "Ticket creation idempotency failed.");

  const create2Envelope = await request("/api/mobile/support/tickets", {
    method: "POST",
    bearer: user2.mobileToken,
    body: {
      subject: "Tenant two billing issue",
      category: "BILLING",
      message: "The invoice details need review.",
      clientMessageId: "create-user2-1",
      clientRequestId: "create-user2-1",
    },
    expected: 201,
  });
  const user2Ticket = mobileData(create2Envelope).ticket as JsonObject;

  const user1List = await request("/api/support/tickets?limit=20", { cookie: user1.webToken, expected: 200 });
  assert(user1List.tickets.length === 1 && user1List.tickets[0].id === user1Ticket.id, "User one list leaked or omitted tickets.");
  const user2List = mobileData(await request("/api/mobile/support/tickets?limit=20", { bearer: user2.mobileToken, expected: 200 }));
  assert(user2List.tickets.length === 1 && user2List.tickets[0].id === user2Ticket.id, "Mobile user list isolation failed.");

  await request(`/api/support/tickets/${user2Ticket.publicId}`, { cookie: user1.webToken, expected: 404 });
  await request(`/api/support/tickets/${user2Ticket.publicId}/messages`, {
    method: "POST",
    cookie: user1.webToken,
    body: { message: "Cross-user reply", clientMessageId: "cross-user-1" },
    expected: 404,
  });
  await request("/api/admin/support/tickets", { cookie: user1.webToken, expected: 403 });
  await request("/api/admin/support/tickets", { bearer: user2.mobileToken, expected: 403 });

  const adminList = await request("/api/admin/support/tickets?limit=20&status=ALL&priority=ALL&category=ALL", { cookie: admin.webToken, expected: 200 });
  assert(adminList.tickets.some((ticket: JsonObject) => ticket.id === user1Ticket.id) && adminList.tickets.some((ticket: JsonObject) => ticket.id === user2Ticket.id), "Admin did not receive all tenant tickets.");
  const adminMobileList = await request("/api/admin/support/tickets?limit=20", { bearer: admin.mobileToken, expected: 200 });
  assert(adminMobileList.tickets.length >= 2, "Mobile admin could not list platform tickets.");

  const adminDetail = await request(`/api/admin/support/tickets/${user1Ticket.publicId}`, { cookie: admin.webToken, expected: 200 });
  assert(adminDetail.messages.length === 1, "Admin could not open the initial conversation.");
  let databaseTicket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: user1Ticket.id } });
  assert(databaseTicket.adminUnreadCount === 0, "Opening admin detail did not clear admin unread count.");

  const adminReplyBody = { body: "We reviewed your connection logs. Please try again.", clientMessageId: "admin-reply-1", visibility: "PUBLIC" };
  await request(`/api/admin/support/tickets/${user1Ticket.publicId}/messages`, { method: "POST", cookie: admin.webToken, body: adminReplyBody, expected: 201 });
  await request(`/api/admin/support/tickets/${user1Ticket.publicId}/messages`, { method: "POST", cookie: admin.webToken, body: adminReplyBody, expected: 200 });
  const duplicateAdminMessages = await prisma.supportTicketMessage.count({ where: { ticketId: user1Ticket.id, clientMessageId: "admin-reply-1" } });
  assert(duplicateAdminMessages === 1, "Admin reply idempotency failed.");
  databaseTicket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: user1Ticket.id } });
  assert(databaseTicket.status === "WAITING_FOR_USER" && databaseTicket.userUnreadCount === 1, "Admin reply state/unread transition failed.");

  const userDetail = await request(`/api/support/tickets/${user1Ticket.publicId}`, { cookie: user1.webToken, expected: 200 });
  assert(userDetail.messages.some((message: JsonObject) => message.senderType === "ADMIN"), "Admin reply was not visible to the ticket creator.");
  databaseTicket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: user1Ticket.id } });
  assert(databaseTicket.userUnreadCount === 0, "Opening user detail did not clear user unread count.");

  const userReplyBody = { body: "I retried and still need help.", clientMessageId: "user-reply-1" };
  await request(`/api/support/tickets/${user1Ticket.publicId}/messages`, { method: "POST", cookie: user1.webToken, body: userReplyBody, expected: 201 });
  await request(`/api/support/tickets/${user1Ticket.publicId}/messages`, { method: "POST", cookie: user1.webToken, body: userReplyBody, expected: 200 });
  databaseTicket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: user1Ticket.id } });
  assert(databaseTicket.status === "WAITING_FOR_ADMIN" && databaseTicket.adminUnreadCount === 1, "User reply state/unread transition failed.");
  assert(await prisma.supportTicketMessage.count({ where: { ticketId: user1Ticket.id, clientMessageId: "user-reply-1" } }) === 1, "User reply idempotency failed.");

  const adminFollowup = await request(`/api/admin/support/tickets/${user1Ticket.publicId}`, { cookie: admin.webToken, expected: 200 });
  assert(adminFollowup.messages.some((message: JsonObject) => message.clientMessageId === "user-reply-1"), "Admin did not see the user follow-up.");

  await request(`/api/admin/support/tickets/${user1Ticket.publicId}/messages`, {
    method: "POST",
    cookie: admin.webToken,
    body: { body: "Internal diagnostic note", clientMessageId: "admin-note-1", visibility: "INTERNAL" },
    expected: 201,
  });
  const userAfterInternal = await request(`/api/support/tickets/${user1Ticket.publicId}`, { cookie: user1.webToken, expected: 200 });
  assert(!userAfterInternal.messages.some((message: JsonObject) => message.clientMessageId === "admin-note-1"), "Internal admin note leaked to the user.");
  const adminAfterInternal = await request(`/api/admin/support/tickets/${user1Ticket.publicId}`, { cookie: admin.webToken, expected: 200 });
  assert(adminAfterInternal.messages.some((message: JsonObject) => message.clientMessageId === "admin-note-1"), "Internal note was not visible to admin.");

  await request(`/api/admin/support/tickets/${user1Ticket.publicId}/priority`, { method: "PATCH", cookie: admin.webToken, body: { priority: "URGENT" }, expected: 200 });
  await request(`/api/admin/support/tickets/${user1Ticket.publicId}/status`, { method: "PATCH", cookie: admin.webToken, body: { status: "IN_PROGRESS" }, expected: 200 });
  await request(`/api/admin/support/tickets/${user1Ticket.publicId}/status`, { method: "PATCH", cookie: admin.webToken, body: { status: "RESOLVED" }, expected: 200 });
  await request(`/api/support/tickets/${user1Ticket.publicId}/messages`, {
    method: "POST",
    cookie: user1.webToken,
    body: { body: "The issue returned after resolution.", clientMessageId: "user-reopen-1" },
    expected: 201,
  });
  databaseTicket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: user1Ticket.id } });
  assert(databaseTicket.status === "WAITING_FOR_ADMIN" && databaseTicket.resolvedAt === null, "Resolved ticket did not reopen on user reply.");
  await request(`/api/admin/support/tickets/${user1Ticket.publicId}/status`, { method: "PATCH", cookie: admin.webToken, body: { status: "CLOSED" }, expected: 200 });
  await request(`/api/support/tickets/${user1Ticket.publicId}/messages`, {
    method: "POST",
    cookie: user1.webToken,
    body: { body: "Closed ticket reply", clientMessageId: "closed-reply-1" },
    expected: 409,
  });

  for (let index = 0; index < 3; index += 1) {
    await request("/api/support/tickets", {
      method: "POST",
      cookie: user1.webToken,
      body: {
        subject: `Pagination ticket ${index}`,
        category: "TECHNICAL",
        message: `Pagination verification message ${index}`,
        clientMessageId: `pagination-${index}`,
        clientRequestId: `pagination-${index}`,
      },
      expected: 201,
    });
  }
  const firstPage = await request("/api/support/tickets?limit=2", { cookie: user1.webToken, expected: 200 });
  assert(firstPage.tickets.length === 2 && firstPage.pageInfo.hasMore && firstPage.pageInfo.nextCursor, "User cursor pagination first page failed.");
  const secondPage = await request(`/api/support/tickets?limit=2&cursor=${encodeURIComponent(firstPage.pageInfo.nextCursor)}`, { cookie: user1.webToken, expected: 200 });
  const firstIds = new Set(firstPage.tickets.map((ticket: JsonObject) => ticket.id));
  assert(secondPage.tickets.every((ticket: JsonObject) => !firstIds.has(ticket.id)), "Cursor pagination returned duplicate rows.");

  const [ticketCount, initialMessageCount, auditCount, userNotificationCount, adminNotificationCount, outboxCount] = await Promise.all([
    prisma.supportTicket.count({ where: { createdById: user1.user.id } }),
    prisma.supportTicketMessage.count({ where: { ticketId: user1Ticket.id, clientMessageId: "create-user1-1" } }),
    prisma.supportTicketAudit.count({ where: { ticketId: user1Ticket.id } }),
    prisma.notification.count({ where: { userId: user1.user.id } }),
    prisma.notification.count({ where: { userId: admin.user.id } }),
    prisma.supportNotificationOutbox.count({ where: { ticketId: user1Ticket.id } }),
  ]);
  assert(ticketCount === 4 && initialMessageCount === 1, "Ticket persistence/idempotency totals are incorrect.");
  assert(auditCount >= 8, "Required ticket audit events were not persisted.");
  assert(userNotificationCount >= 2 && adminNotificationCount >= 2, "User/admin notifications were not created.");
  assert(outboxCount >= 6, "Transactional notification outbox records are missing.");
  await new Promise((resolve) => setTimeout(resolve, 750));
  const outboxByStatus = await prisma.supportNotificationOutbox.groupBy({
    by: ["status"],
    where: { ticketId: user1Ticket.id },
    _count: { _all: true },
  });
  assert(!outboxByStatus.some((entry) => entry.status === "FAILED"), "A support notification permanently failed in the integration flow.");

  console.log(JSON.stringify({
    ok: true,
    userIsolation: true,
    adminAuthorization: true,
    mobileParity: true,
    bidirectionalConversation: true,
    idempotency: true,
    unreadState: true,
    internalNoteIsolation: true,
    statusStateMachine: true,
    cursorPagination: true,
    notifications: { userNotificationCount, adminNotificationCount, outboxCount, outboxByStatus },
    auditCount,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
