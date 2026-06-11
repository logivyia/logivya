import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    service: "logivya-web",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
