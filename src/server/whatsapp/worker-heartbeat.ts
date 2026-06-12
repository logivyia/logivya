import Redis from "ioredis";

const HEARTBEAT_KEY = "logivya:whatsapp-worker:heartbeat";
const HEARTBEAT_TTL_SECONDS = 20;

function client() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
  return new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
}

export async function writeWorkerHeartbeat(workerId: string) {
  const redis = client();
  try {
    await redis.connect();
    await redis.set(HEARTBEAT_KEY, JSON.stringify({ workerId, timestamp: new Date().toISOString() }), "EX", HEARTBEAT_TTL_SECONDS);
  } finally {
    redis.disconnect();
  }
}

export async function readWorkerHeartbeat() {
  const redis = client();
  try {
    await redis.connect();
    const value = await redis.get(HEARTBEAT_KEY);
    return value ? JSON.parse(value) as { workerId: string; timestamp: string } : null;
  } finally {
    redis.disconnect();
  }
}
