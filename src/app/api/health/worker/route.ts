import { NextResponse } from "next/server";
import { publicHealthResponse } from "@/server/monitoring/contracts";
import { checkWorkerHealth } from "@/server/monitoring/health";

export async function GET() {
  const health = await checkWorkerHealth();
  return NextResponse.json(publicHealthResponse(health.service.state), { status: health.service.state === "UNAVAILABLE" ? 503 : 200, headers: { "cache-control": "no-store" } });
}
