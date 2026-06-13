import "server-only";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";

let redis: IORedis | undefined;

function redisClient() {
  if (!process.env.REDIS_URL) throw new Error("ADMIN_RATE_LIMIT_UNAVAILABLE");
  redis ??= new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return redis;
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
  const count = await redisClient().incr(key);
  if (count === 1) await redisClient().expire(key, windowSeconds);
  if (count > max) throw new Error("ADMIN_RATE_LIMITED");
}

export function safeAdminError(error: unknown, id: string) {
  const code = error instanceof Error ? error.message : "ADMIN_REQUEST_FAILED";
  const status = code === "UNAUTHORIZED" ? 401
    : code === "FORBIDDEN" || code === "CSRF_REJECTED" ? 403
    : code === "ADMIN_RATE_LIMITED" ? 429
    : code === "ADMIN_RECENT_AUTH_REQUIRED" || code === "ADMIN_MFA_REQUIRED" ? 428
    : 500;
  return { status, body: { error: status === 500 ? "İşlem tamamlanamadı. Lütfen tekrar deneyin." : code, requestId: id } };
}
