import { NextResponse } from "next/server";
import { publicHealthResponse } from "@/server/monitoring/contracts";

export function GET() {
  return NextResponse.json(publicHealthResponse("HEALTHY"), { headers: { "cache-control": "no-store" } });
}
