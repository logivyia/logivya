import { NextResponse } from "next/server";
import { messageQueue, whatsappQueue } from "@/server/queues/client";
import { getCachedQueueHealth } from "@/server/queues/health";
import { isWorkerHeartbeatFresh, readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_WORKER_HEALTH_ERROR";
}

export async function GET() {
  const workerUrl = process.env.WHATSAPP_WORKER_URL || process.env.WORKER_HEALTH_URL;
  const remote = workerUrl
    ? await fetch(workerUrl, {
      cache: "no-store",
      headers: process.env.WHATSAPP_SESSION_SECRET ? { authorization: `Bearer ${process.env.WHATSAPP_SESSION_SECRET}` } : undefined,
      signal: AbortSignal.timeout(3_000),
    }).then((response) => response.ok).catch(() => false)
    : null;
  let heartbeatError: string | null = null;
  const heartbeat = await readWorkerHeartbeat().catch((error) => {
    heartbeatError = safeError(error);
    return null;
  });
  const heartbeatFresh = isWorkerHeartbeatFresh(heartbeat);

  const queues = await Promise.all([
    getCachedQueueHealth("logivya-sync", whatsappQueue),
    getCachedQueueHealth("logivya-message", messageQueue),
  ]);
  const queueStatus = queues.every((queue) => queue.status === "healthy") ? "healthy" : "unhealthy";

  const workerReachable = remote === true || heartbeatFresh;
  const healthy = workerReachable && queueStatus === "healthy";
  return NextResponse.json({
    service: "logivya-worker",
    status: healthy ? "healthy" : "unhealthy",
    remoteConfigured: Boolean(workerUrl),
    remoteReachable: remote,
    heartbeat,
    heartbeatError,
    heartbeatFresh,
    workerReachable,
    queueStatus,
    queues,
  }, { status: healthy ? 200 : 503 });
}
