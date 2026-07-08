import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { redisConnectionOptions } from "@/server/queues/client";
import { logger } from "@/server/observability/logger";

/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * Account-scoped distributed lock for socket/session/message operations.
 */

type LockOptions = {
  ttlMs?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  correlationId?: string;
};

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const DEFAULT_TTL_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 250;

function lockKey(accountId: string) {
  return `logivya:whatsapp-account-lock:${accountId}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs: number) {
  return baseMs + Math.floor(Math.random() * Math.max(25, baseMs));
}

export async function withWhatsAppAccountLock<T>(
  accountId: string,
  operation: string,
  task: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? Number(process.env.WHATSAPP_ACCOUNT_LOCK_TTL_MS || DEFAULT_TTL_MS);
  const timeoutMs = options.timeoutMs ?? Number(process.env.WHATSAPP_ACCOUNT_LOCK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const retryDelayMs = options.retryDelayMs ?? Number(process.env.WHATSAPP_ACCOUNT_LOCK_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS);
  const key = lockKey(accountId);
  const token = `${process.pid}:${randomUUID()}`;
  const redis = new Redis(redisConnectionOptions());
  const startedAt = Date.now();
  let acquired = false;

  try {
    while (Date.now() - startedAt < timeoutMs) {
      const result = await redis.set(key, token, "PX", ttlMs, "NX");
      if (result === "OK") {
        acquired = true;
        logger.info("WA_ACCOUNT_LOCK_ACQUIRED", {
          accountId,
          operation,
          elapsedMs: Date.now() - startedAt,
          ttlMs,
          correlationId: options.correlationId,
        });
        return await task();
      }
      await sleep(jitter(retryDelayMs));
    }

    logger.warn("WA_ACCOUNT_LOCK_TIMEOUT", {
      accountId,
      operation,
      timeoutMs,
      correlationId: options.correlationId,
    });
    throw new Error("WHATSAPP_ACCOUNT_LOCK_TIMEOUT");
  } finally {
    if (acquired) {
      try {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
        logger.info("WA_ACCOUNT_LOCK_RELEASED", {
          accountId,
          operation,
          correlationId: options.correlationId,
        });
      } catch (error) {
        logger.error("WA_ACCOUNT_LOCK_RELEASE_FAILED", error, {
          accountId,
          operation,
          correlationId: options.correlationId,
        });
      }
    }
    await redis.quit().catch(() => undefined);
  }
}
