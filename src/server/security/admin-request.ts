import "server-only";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";

let redis: IORedis | undefined;

function redisClient() {
  if (!process.env.REDIS_URL) throw new Error("ADMIN_RATE_LIMIT_UNAVAILABLE");
  redis ??= new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return redis;
}

async function readyRedisClient() {
  const client = redisClient();
  if (client.status === "ready") return client;
  if (client.status === "end") {
    await client.connect();
    return client;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const onReady = () => finish();
    const onError = () => finish(new Error("ADMIN_RATE_LIMIT_UNAVAILABLE"));
    const timeout = setTimeout(() => finish(new Error("ADMIN_RATE_LIMIT_UNAVAILABLE")), 3_000);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.off("ready", onReady);
      client.off("error", onError);
      if (error) reject(error);
      else resolve();
    }

    client.once("ready", onReady);
    client.once("error", onError);
    if (String(client.status) === "ready") finish();
  });
  return client;
}

export function requestId(request?: Request) {
  return request?.headers.get("x-request-id")?.slice(0, 128) || randomUUID();
}

export function assertAdminCsrf(request: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new Error("CSRF_REJECTED");
}

export async function enforceAdminRateLimit(request: Request, userId: string, permission: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const max = mutation ? 20 : 240;
  const windowSeconds = mutation ? 600 : 60;
  const key = `logivya:admin:${request.method}:${permission}:${userId}:${ip}`;
  const client = await readyRedisClient();
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, windowSeconds);
  if (count > max) throw new Error("ADMIN_RATE_LIMITED");
}

export function safeAdminError(error: unknown, id: string) {
  const code = error instanceof Error ? error.message : "ADMIN_REQUEST_FAILED";
  const status = code === "UNAUTHORIZED" ? 401
    : code === "FORBIDDEN" || code === "CSRF_REJECTED" ? 403
    : code === "ADMIN_RATE_LIMITED" ? 429
    : code === "ADMIN_RECENT_AUTH_REQUIRED" || code === "ADMIN_MFA_REQUIRED" ? 428
    : 500;
  return { status, body: { error: status === 500 ? "ADMIN_REQUEST_FAILED" : code, requestId: id } };
}
