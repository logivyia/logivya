import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";
import { CAMPAIGN_PAIR_COOLDOWN_MS, SEND_RESTRICTION_COOLDOWN_MS, WhatsAppSendSafety, WhatsAppSendSafetyError, sendIntervalMs, type SendSafetyStore } from "./send-safety-policy";

// Account-scoped, durable admission: each campaign counts once, regardless of
// recipient count, concurrent workers, scheduled sends or queue recovery.
export const RESERVE_CAMPAIGN_SCRIPT = `
local clock = redis.call('time')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local paused = redis.call('pttl', KEYS[3])
if paused == -1 then return tonumber(ARGV[1]) end
if paused > 0 then return paused end
local existing = redis.call('get', KEYS[2])
if existing then return math.max(0, tonumber(existing) - now) end
local nextAt = tonumber(redis.call('hget', KEYS[1], 'nextAt') or '0')
local count = tonumber(redis.call('hget', KEYS[1], 'count') or '0')
local at = math.max(now, nextAt)
if count >= 2 or now >= nextAt then count = 0 end
count = count + 1
local following = at + tonumber(ARGV[1])
redis.call('hset', KEYS[1], 'nextAt', following, 'count', count)
-- The second member of a pair uses the first member's time, not the next pair.
if count == 2 then at = math.max(now, nextAt - tonumber(ARGV[1])); following = at + tonumber(ARGV[1]); redis.call('hset', KEYS[1], 'nextAt', following) end
redis.call('pexpire', KEYS[1], math.max(1, following - now + tonumber(ARGV[1])))
redis.call('set', KEYS[2], at, 'PX', math.max(2592000000, at - now + 2592000000))
return math.max(0, at - now)
`;

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
    return ttl === -1 ? SEND_RESTRICTION_COOLDOWN_MS : Math.max(0, ttl);
  }
  async reserveCampaign(accountId: string, campaignId: string, cooldownMs = CAMPAIGN_PAIR_COOLDOWN_MS) {
    return Number(await this.redis.eval(RESERVE_CAMPAIGN_SCRIPT, 3,
      `${this.key(accountId)}:campaign-pairs`, `${this.key(accountId)}:campaign:${campaignId}`,
      `${this.key(accountId)}:paused`, cooldownMs));
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
    // Accept new campaigns during a temporary pause. The worker retains them
    // in the delayed queue until the account is eligible; no fake failures.
    await safetyStore().pauseRemainingMs(accountId);
  } catch (error) {
    if (error instanceof WhatsAppSendSafetyError) throw error;
    throw new WhatsAppSendSafetyError("WHATSAPP_SEND_SAFETY_UNAVAILABLE");
  }
}
export async function campaignSendWaitMs(accountId: string, campaignId: string) {
  try {
    const wait = await safetyStore().reserveCampaign(accountId, campaignId);
    if (!Number.isFinite(wait) || wait < 0) throw new Error("Invalid campaign permit");
    return wait;
  } catch { throw new WhatsAppSendSafetyError("WHATSAPP_SEND_SAFETY_UNAVAILABLE"); }
}
export function withWhatsAppSendSafety<T>(accountId: string, dispatch: () => Promise<T>) {
  safety ??= new WhatsAppSendSafety(safetyStore(), sendIntervalMs());
  return safety.send(accountId, dispatch);
}
