import { NextResponse } from "next/server";

import { requireMonitoringAccess } from "@/server/monitoring/access";
import { getSystemHealthSnapshot } from "@/server/monitoring/health";

export async function GET(request: Request) {
  try {
    await requireMonitoringAccess(request);
    return NextResponse.json(await getSystemHealthSnapshot(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return NextResponse.json({ error: code === "FORBIDDEN" ? code : "UNAUTHORIZED" }, { status: code === "FORBIDDEN" ? 403 : 401 });
  }
}
