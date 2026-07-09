import { NextResponse } from "next/server";

const WEB_RELEASE_MARKER = "WHATSAPP_PAIRING_LIVE_WA_WEB_VERSION_LOCAL_WORKER_GUARD_V120";

export function GET() {
  return NextResponse.json({
    service: "logivya-web",
    status: "healthy",
    releaseMarker: WEB_RELEASE_MARKER,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || null,
    timestamp: new Date().toISOString(),
  });
}
