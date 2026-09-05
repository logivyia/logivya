import "server-only";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { requestObservabilityIds } from "@/server/observability/request-id";
import { assertWebMutationOrigin } from "@/server/security/request-origin";
import { adminRateLimitPolicy, consumeAdminRateLimit } from "@/server/security/admin-rate-limit";

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
  return request ? requestObservabilityIds(request).requestId : randomUUID();
}

export function assertAdminCsrf(request: Request) {
  assertWebMutationOrigin(request);
}

export async function enforceAdminRateLimit(request: Request, userId: string, permission: string) {
  const client = await readyRedisClient();
  await consumeAdminRateLimit(client, adminRateLimitPolicy(request, userId, permission));
}

export function safeAdminError(error: unknown, id: string) {
  const code = error instanceof Error ? error.message : "ADMIN_REQUEST_FAILED";
  const status = code === "UNAUTHORIZED" ? 401
    : code === "FORBIDDEN" || code === "CSRF_REJECTED" ? 403
    : code === "ADMIN_RATE_LIMITED" ? 429
    : code === "ADMIN_RECENT_AUTH_REQUIRED" || code === "ADMIN_MFA_REQUIRED" ? 428
    : code === "ADMIN_REASON_REQUIRED" ? 400
    : 500;
  return { status, body: { error: status === 500 ? "ADMIN_REQUEST_FAILED" : code, requestId: id } };
}
