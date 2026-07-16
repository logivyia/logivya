import { NextResponse } from "next/server";

import { requireMonitoringAccess } from "@/server/monitoring/access";

export async function GET(request: Request) {
  try {
    await requireMonitoringAccess(request);
    return NextResponse.json({
      service: "logivya-platform",
      environment: process.env.LOG_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      release: process.env.LOG_RELEASE_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: code === "FORBIDDEN" ? code : "UNAUTHORIZED" }, { status: code === "FORBIDDEN" ? 403 : 401 });
  }
}
