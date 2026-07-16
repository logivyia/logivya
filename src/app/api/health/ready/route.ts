import { NextResponse } from "next/server";
import { publicHealthResponse } from "@/server/monitoring/contracts";
import { getCoreReadiness } from "@/server/monitoring/health";

export async function GET() {
  const readiness = await getCoreReadiness();
  return NextResponse.json(publicHealthResponse(readiness.status), {
    status: readiness.status === "UNAVAILABLE" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
