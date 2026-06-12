import { NextResponse } from "next/server";
import { messageQueue, whatsappQueue } from "@/server/queues/client";

export async function GET() {
  const queues = [whatsappQueue(), messageQueue()];
  try {
    const [sessions, messages] = await Promise.all(queues.map((queue) => queue.getJobCounts("waiting", "active", "delayed", "failed")));
    const workerUrl = process.env.WHATSAPP_WORKER_URL || process.env.WORKER_HEALTH_URL;
    const remote = workerUrl ? await fetch(workerUrl, { cache: "no-store", headers: process.env.WHATSAPP_SESSION_SECRET ? { authorization: `Bearer ${process.env.WHATSAPP_SESSION_SECRET}` } : undefined, signal: AbortSignal.timeout(3_000) }).then((response) => response.ok).catch(() => false) : null;
    const healthy = remote === true;
    return NextResponse.json({
      service: "logivya-worker",
      status: healthy ? "healthy" : "unhealthy",
      remoteConfigured: Boolean(workerUrl),
      remoteReachable: remote,
      queues: { sessions, messages },
    }, { status: healthy ? 200 : 503 });
  } catch {
    return NextResponse.json({ service: "logivya-worker", status: "unhealthy" }, { status: 503 });
  } finally {
    await Promise.all(queues.map((queue) => queue.close()));
  }
}
