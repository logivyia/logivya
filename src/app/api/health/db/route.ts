import { NextResponse } from "next/server";
import { publicHealthResponse } from "@/server/monitoring/contracts";
import { checkDatabaseHealth } from "@/server/monitoring/health";

export async function GET() {
  const health = await checkDatabaseHealth();
  return NextResponse.json(publicHealthResponse(health.state), { status: health.state === "UNAVAILABLE" ? 503 : 200, headers: { "cache-control": "no-store" } });
}
