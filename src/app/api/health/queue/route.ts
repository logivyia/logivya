import { NextResponse } from "next/server";
import { getCoreQueueHealth } from "@/server/queues/health";

export async function GET() {
  const queues = await getCoreQueueHealth();
  const healthy = queues.every((queue) => queue.status === "healthy");
  return NextResponse.json(
    { service: "logivya-queue", status: healthy ? "healthy" : "unhealthy", cacheMs: Number(process.env.QUEUE_HEALTH_CACHE_MS || 15_000), queues },
    { status: healthy ? 200 : 503 },
  );
}
