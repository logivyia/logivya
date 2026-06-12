import { NextResponse } from "next/server";
import { messageQueue, whatsappQueue } from "@/server/queues/client";

export async function GET() {
  const queues = [whatsappQueue(), messageQueue()];
  try {
    const [sessions, messages] = await Promise.all(queues.map((queue) => queue.getJobCounts("waiting", "active", "delayed", "failed")));
    const workerUrl = process.env.WORKER_HEALTH_URL;
    const remote = workerUrl ? await fetch(workerUrl, { cache: "no-store", signal: AbortSignal.timeout(3_000) }).then((response) => response.ok).catch(() => false) : null;
    return NextResponse.json({
      service: "logivya-worker",
      status: remote === false ? "unhealthy" : "healthy",
      remoteConfigured: Boolean(workerUrl),
      remoteReachable: remote,
      queues: { sessions, messages },
    }, { status: remote === false ? 503 : 200 });
  } catch {
    return NextResponse.json({ service: "logivya-worker", status: "unhealthy" }, { status: 503 });
  } finally {
    await Promise.all(queues.map((queue) => queue.close()));
  }
}
