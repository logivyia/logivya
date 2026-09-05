import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.systemHealth.read", request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim().toUpperCase();
    const incidents = await prisma.incidentLog.findMany({
      where: status ? { status } : undefined,
      select: {
        id: true,
        severity: true,
        title: true,
        status: true,
        startedAt: true,
        resolvedAt: true,
      },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      incidents,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("admin.incidents.list_failed", error);
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
