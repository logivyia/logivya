import { NextResponse } from "next/server";
import { messageQueue, whatsappQueue } from "@/server/queues/client";
import { readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";

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
  const heartbeat = await readWorkerHeartbeat().catch(() => null);
  const heartbeatFresh = Boolean(heartbeat && Date.now() - new Date(heartbeat.timestamp).getTime() <= 20_000);

  const queueSnapshots: Record<string, unknown> = {};
  let queueStatus: "healthy" | "unhealthy" = "healthy";
  const queues = [
    { name: "sessions", queue: whatsappQueue() },
    { name: "messages", queue: messageQueue() },
  ];
  for (const item of queues) {
    try {
      queueSnapshots[item.name] = await item.queue.getJobCounts("waiting", "active", "delayed", "failed");
    } catch (error) {
      queueStatus = "unhealthy";
      queueSnapshots[item.name] = { error: safeError(error) };
    } finally {
      await item.queue.close().catch(() => undefined);
    }
  }

  const healthy = remote === true || heartbeatFresh;
  return NextResponse.json({
    service: "logivya-worker",
    status: healthy ? "healthy" : "unhealthy",
    remoteConfigured: Boolean(workerUrl),
    remoteReachable: remote,
    heartbeat,
    heartbeatFresh,
    queueStatus,
    queues: queueSnapshots,
  }, { status: healthy ? 200 : 503 });
}
