import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.dashboard.read", request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim().toUpperCase();
    const incidents = await prisma.incidentLog.findMany({
      where: status ? { status } : undefined,
      select: { id: true, severity: true, title: true, status: true, startedAt: true, resolvedAt: true },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ incidents, generatedAt: new Date().toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
    logger.error("admin.incidents.list_failed", error);
    return NextResponse.json({ error: "INCIDENT_LIST_FAILED" }, { status: 500 });
  }
}
