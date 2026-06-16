import { NextResponse } from "next/server";
import { campaignQueue, messageQueue, whatsappQueue } from "@/server/queues/client";

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_QUEUE_ERROR";
}

async function countsFor(name: string, createQueue: () => ReturnType<typeof messageQueue>) {
  const queue = createQueue();
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
    return { name, status: "healthy", counts };
  } catch (error) {
    return { name, status: "unhealthy", error: safeError(error) };
  } finally {
    await queue.close().catch(() => undefined);
  }
}

export async function GET() {
  const queues = await Promise.all([
    countsFor("logivya-sync", whatsappQueue),
    countsFor("logivya-message", messageQueue),
    countsFor("logivya-campaign", campaignQueue),
  ]);
  const healthy = queues.every((queue) => queue.status === "healthy");
  return NextResponse.json({ service: "logivya-queue", status: healthy ? "healthy" : "unhealthy", queues }, { status: healthy ? 200 : 503 });
}
