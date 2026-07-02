import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import IORedis from "ioredis";

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
  return env;
}

const fileEnv = {
  ...readEnvFile(path.join(process.cwd(), ".env")),
  ...readEnvFile(path.join(process.cwd(), ".env.local")),
};

const redisUrl = fileEnv.REDIS_URL || process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is missing.");
const resolvedRedisUrl = redisUrl;

const accountId = process.argv[2];
if (!accountId) throw new Error("Usage: tsx scripts/inspect-whatsapp-rate-limit.ts <accountId> [--clear]");

const hash = createHash("sha256").update(accountId).digest("hex");
const key = `logivya:whatsapp-limit:qr-account:${hash}`;
const shouldClear = process.argv.includes("--clear");

async function main() {
  const redis = new IORedis(resolvedRedisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  try {
    if (redis.status !== "ready") {
      await new Promise<void>((resolve, reject) => {
        redis.once("ready", resolve);
        redis.once("error", reject);
      });
    }
    const before = { key, value: await redis.get(key), ttlSeconds: await redis.ttl(key) };
    if (shouldClear) await redis.del(key);
    const after = shouldClear ? { value: await redis.get(key), ttlSeconds: await redis.ttl(key) } : undefined;
    console.log(JSON.stringify({ accountId, before, after }, null, 2));
  } finally {
    redis.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
