import { createHash } from "node:crypto";
import IORedis from "ioredis";

let redis: IORedis | undefined;
function client() {
  if (!process.env.REDIS_URL) throw new Error("WHATSAPP_RATE_LIMIT_UNAVAILABLE");
  redis ??= new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return redis;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (new URL(origin).host !== new URL(request.url).host) throw new Error("CSRF_REJECTED");
}

export async function enforceWhatsAppRateLimit(scope: string, subject: string, max = 5, windowSeconds = 600) {
  const key = `logivya:whatsapp-limit:${scope}:${createHash("sha256").update(subject).digest("hex")}`;
  const count = await client().incr(key);
  if (count === 1) await client().expire(key, windowSeconds);
  if (count > max) throw new Error("WHATSAPP_RATE_LIMITED");
}
