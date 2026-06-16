import { NextResponse } from "next/server";
import { messageQueue, whatsappQueue } from "@/server/queues/client";
import { readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_WORKER_HEALTH_ERROR";
}

async function queueSnapshot(name: string, queue: ReturnType<typeof messageQueue>) {
  try {
    return { name, status: "healthy" as const, counts: await queue.getJobCounts("waiting", "active", "delayed", "failed") };
  } catch (error) {
    return { name, status: "unhealthy" as const, error: safeError(error) };
  } finally {
    await queue.close().catch(() => undefined);
  }
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
  const heartbeatFresh = Boolean(heartbeat && Date.now() - new Date(heartbeat.timestamp).getTime() <= 20_000);

  const queues = await Promise.all([
    queueSnapshot("logivya-sync", whatsappQueue()),
    queueSnapshot("logivya-message", messageQueue()),
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
