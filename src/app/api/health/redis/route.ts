import { NextResponse } from "next/server";
import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_REDIS_ERROR";
}

export async function GET() {
  const started = Date.now();
  let redis: Redis | null = null;

  try {
    redis = new Redis({ ...redisConnectionOptions(), lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
    await redis.ping();
    return NextResponse.json({ service: "logivya-redis", status: "healthy", latencyMs: Date.now() - started });
  } catch (error) {
    return NextResponse.json({ service: "logivya-redis", status: "unhealthy", error: safeError(error) }, { status: 503 });
  } finally {
    redis?.disconnect();
  }
}
