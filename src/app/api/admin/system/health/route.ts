import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { messageQueue } from "@/server/queues/client";
import { getCachedQueueHealth } from "@/server/queues/health";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const queue = await getCachedQueueHealth("logivya-message", messageQueue, ["waiting", "active", "delayed", "failed", "paused"]);
    const errors = await prisma.incidentLog.findMany({ where: { resolvedAt: null }, orderBy: { startedAt: "desc" }, take: 20 });
    const active = queue.status === "healthy" ? queue.counts.active ?? 0 : 0;
    return NextResponse.json({
      app: "healthy",
      database: { status: "healthy", latencyMs: Date.now() - started },
      queue,
      worker: active > 0 ? "active" : "idle",
      storage: process.env.S3_BUCKET ? "configured" : "not_configured",
      email: process.env.EMAIL_PROVIDER || "not_configured",
      errors,
    });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}
