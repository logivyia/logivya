import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { deleteOwnedTelegramDispatchForEveryone } from "@/server/telegram/delete-for-everyone";
import { materializeDueTelegramRuns, processNextTelegramDelivery, recoverTelegramDeliveryLocks } from "@/server/telegram/dispatch-worker";
import { backfillTelegramFreightCandidates, closeAllTelegramClients, ensureTelegramClient, logoutTelegramClient, submitTelegramAuthentication, syncTelegramChats, telegramRuntimeInfo } from "@/server/telegram/tdlib-client";

const PORT = Number(process.env.TELEGRAM_WORKER_PORT || 3011);
const MARKER = "TELEGRAM_TDLIB_DELETE_FOR_EVERYONE_V2";
let stopping = false;

function authorized(request: IncomingMessage) {
  const expected = process.env.TELEGRAM_WORKER_SECRET;
  const received = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function jsonBody(request: IncomingMessage) {
  let value = "";
  for await (const chunk of request) {
    value += String(chunk);
    if (value.length > 64 * 1024) throw new Error("PAYLOAD_TOO_LARGE");
  }
  return value ? JSON.parse(value) as Record<string, unknown> : {};
}

function respond(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function safeError(error: unknown) {
  const code = error instanceof Error ? error.message.slice(0, 160) : "TELEGRAM_WORKER_ERROR";
  const status = code === "TELEGRAM_ACCOUNT_NOT_FOUND" || code === "TELEGRAM_NOT_FOUND"
    ? 404
    : code.startsWith("TELEGRAM_AUTH_STATE_") || code === "TELEGRAM_DELETE_BUSY" || code === "TELEGRAM_DELETE_UNAVAILABLE"
      ? 409
      : 400;
  return { status, payload: { ok: false, error: { code, message: code } } };
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return respond(response, 200, { ok: true, data: { marker: MARKER, ...telegramRuntimeInfo() } });
  }
  if (!authorized(request)) return respond(response, 401, { ok: false, error: { code: "UNAUTHORIZED", message: "UNAUTHORIZED" } });

  const dispatchDeleteMatch = url.pathname.match(
    /^\/dispatches\/([^/]+)\/delete-for-everyone$/,
  );
  if (request.method === "POST" && dispatchDeleteMatch) {
    const dispatchId = dispatchDeleteMatch[1];
    try {
      const body = await jsonBody(request);
      if (typeof body.companyId !== "string" || typeof body.userId !== "string") {
        throw new Error("TELEGRAM_DELETE_INPUT_INVALID");
      }
      const data = await deleteOwnedTelegramDispatchForEveryone({
        dispatchId,
        companyId: body.companyId,
        userId: body.userId,
      });
      return respond(response, 200, { ok: true, data });
    } catch (error) {
      logger.error("telegram.worker_delete_failed", error, { dispatchId });
      const result = safeError(error);
      return respond(response, result.status, result.payload);
    }
  }

  const freightBackfillMatch = url.pathname.match(/^\/accounts\/([^/]+)\/freight-backfill$/);
  if (request.method === "POST" && freightBackfillMatch) {
    const accountId = freightBackfillMatch[1];
    try {
      const body = await jsonBody(request);
      const data = await backfillTelegramFreightCandidates(accountId, {
        maxChats: typeof body.maxChats === "number" ? body.maxChats : undefined,
        messagesPerChat: typeof body.messagesPerChat === "number" ? body.messagesPerChat : undefined,
      });
      return respond(response, 200, { ok: true, data });
    } catch (error) {
      logger.error("telegram.worker_freight_backfill_failed", error, { accountId });
      const result = safeError(error);
      return respond(response, result.status, result.payload);
    }
  }

  const match = url.pathname.match(/^\/accounts\/([^/]+)\/(start|auth|sync|logout)$/);
  if (request.method !== "POST" || !match) return respond(response, 404, { ok: false, error: { code: "NOT_FOUND", message: "NOT_FOUND" } });
  const [, accountId, action] = match;
  try {
    const body = await jsonBody(request);
    if (action === "start") {
      const managed = await ensureTelegramClient(accountId);
      return respond(response, 200, { ok: true, data: { authState: managed.state, status: managed.state === "READY" ? "CONNECTED" : "AUTHENTICATING", detail: managed.stateDetail } });
    }
    if (action === "auth") {
      if (typeof body.step !== "string" || typeof body.value !== "string") throw new Error("TELEGRAM_AUTH_INPUT_INVALID");
      return respond(response, 200, { ok: true, data: await submitTelegramAuthentication(accountId, body.step, body.value) });
    }
    if (action === "sync") return respond(response, 200, { ok: true, data: await syncTelegramChats(accountId) });
    return respond(response, 200, { ok: true, data: await logoutTelegramClient(accountId) });
  } catch (error) {
    logger.error("telegram.worker_request_failed", error, { accountId, action });
    const result = safeError(error);
    return respond(response, result.status, result.payload);
  }
}

async function restoreAccounts() {
  const accounts = await prisma.telegramAccount.findMany({
    where: { archivedAt: null, status: { in: ["CONNECTED", "AUTHENTICATING", "REAUTHORIZATION_REQUIRED"] } },
    select: { id: true },
  });
  for (const account of accounts) {
    await ensureTelegramClient(account.id).catch((error) => logger.error("telegram.restore_failed", error, { accountId: account.id }));
  }
}

async function deliveryLoop() {
  if (stopping) return;
  try {
    await materializeDueTelegramRuns();
    for (let index = 0; index < 10; index += 1) {
      if (!(await processNextTelegramDelivery())) break;
    }
  } catch (error) {
    logger.error("telegram.delivery_loop_failed", error);
  }
}

const server = createServer((request, response) => void handle(request, response));
let timer: ReturnType<typeof setInterval> | null = null;

async function start() {
  await recoverTelegramDeliveryLocks();
  await restoreAccounts();
  server.listen(PORT, "0.0.0.0", () => logger.info("telegram.worker_started", { marker: MARKER, port: PORT }));
  timer = setInterval(() => void deliveryLoop(), 2_000);
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  logger.info("telegram.worker_stopping", { signal });
  server.close();
  await closeAllTelegramClients();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void start().catch(async (error) => {
  logger.error("telegram.worker_start_failed", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
