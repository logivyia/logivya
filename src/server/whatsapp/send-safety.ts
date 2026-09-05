import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";
import { WhatsAppSendSafety, WhatsAppSendSafetyError, sendIntervalMs, type SendSafetyStore } from "./send-safety-policy";

export const RESERVE_SEND_SCRIPT = `
if redis.call('exists', KEYS[2]) == 1 then return -1 end
local remaining = redis.call('pttl', KEYS[1])
if remaining > 0 then return remaining end
redis.call('set', KEYS[1], 'reserved', 'PX', ARGV[1])
return 0
`;

export class RedisSendSafetyStore implements SendSafetyStore {
  constructor(private readonly redis: Redis, private readonly prefix = "logivya:whatsapp-send-safety") {}
  private key(accountId: string) { return `${this.prefix}:{${accountId}}`; }
  async reserve(accountId: string, intervalMs: number) {
    return Number(await this.redis.eval(RESERVE_SEND_SCRIPT, 2, `${this.key(accountId)}:interval`, `${this.key(accountId)}:paused`, intervalMs));
  }
  async pause(accountId: string, durationMs: number) {
    await this.redis.set(`${this.key(accountId)}:paused`, "PROVIDER_RESTRICTION", "PX", Math.max(1, Math.ceil(durationMs)));
  }
  async pauseRemainingMs(accountId: string) {
    const ttl = await this.redis.pttl(`${this.key(accountId)}:paused`);
    return ttl === -1 ? 24 * 60 * 60_000 : Math.max(0, ttl);
  }
}

let safety: WhatsAppSendSafety | undefined;
let store: RedisSendSafetyStore | undefined;
function safetyStore() {
  if (!store) {
    const redis = new Redis({ ...redisConnectionOptions(), maxRetriesPerRequest: 1, commandTimeout: 5000 });
    // The request receives a safe error; do not log connection strings or raw Redis errors.
    redis.on("error", () => undefined);
    store = new RedisSendSafetyStore(redis);
  }
  return store;
}
export async function assertWhatsAppSendingAvailable(accountId: string) {
  try {
    if (await safetyStore().pauseRemainingMs(accountId) > 0) throw new WhatsAppSendSafetyError("WHATSAPP_SEND_PAUSED");
  } catch (error) {
    if (error instanceof WhatsAppSendSafetyError) throw error;
    throw new WhatsAppSendSafetyError("WHATSAPP_SEND_SAFETY_UNAVAILABLE");
  }
}
export function withWhatsAppSendSafety<T>(accountId: string, dispatch: () => Promise<T>) {
  safety ??= new WhatsAppSendSafety(safetyStore(), sendIntervalMs());
  return safety.send(accountId, dispatch);
}
