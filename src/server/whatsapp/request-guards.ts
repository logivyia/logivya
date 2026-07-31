import { createHash } from "node:crypto";
import IORedis from "ioredis";
import { redisConnectionUrl } from "@/server/queues/client";

let redis: IORedis | undefined;
function client() {
  let url: string;
  try {
    url = redisConnectionUrl();
  } catch {
    throw new Error("WHATSAPP_RATE_LIMIT_UNAVAILABLE");
  }
  redis ??= new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  return redis;
}

async function readyClient() {
  const redisClient = client();
  if (redisClient.status === "ready") return redisClient;
  if (redisClient.status === "end") throw new Error("WHATSAPP_RATE_LIMIT_UNAVAILABLE");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("WHATSAPP_RATE_LIMIT_UNAVAILABLE"));
    }, 3_000);
    const cleanup = () => {
      clearTimeout(timeout);
      redisClient.off("ready", onReady);
      redisClient.off("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(error);
    };
    redisClient.once("ready", onReady);
    redisClient.once("error", onError);
  });
  return redisClient;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (new URL(origin).host !== new URL(request.url).host) throw new Error("CSRF_REJECTED");
}

export async function enforceWhatsAppRateLimit(scope: string, subject: string, max = 5, windowSeconds = 600) {
  const key = `logivya:whatsapp-limit:${scope}:${createHash("sha256").update(subject).digest("hex")}`;
  const redisClient = await readyClient();
  const count = await redisClient.incr(key);
  if (count === 1) await redisClient.expire(key, windowSeconds);
  if (count > max) throw new Error("WHATSAPP_RATE_LIMITED");
}

export function whatsappRequestErrorStatus(error: unknown, fallback = 503) {
  if (!(error instanceof Error)) return fallback;
  if (error.message === "UNAUTHORIZED") return 401;
  if (error.message === "CSRF_REJECTED") return 403;
  if (error.message === "WHATSAPP_RATE_LIMITED") return 429;
  return fallback;
}
