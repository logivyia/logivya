import { NextResponse } from "next/server";

const WEB_RELEASE_MARKER = "WHATSAPP_PAIRING_LIVE_WA_WEB_VERSION_V119";

export function GET() {
  return NextResponse.json({
    service: "logivya-web",
    status: "healthy",
    releaseMarker: WEB_RELEASE_MARKER,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || null,
    timestamp: new Date().toISOString(),
  });
}
