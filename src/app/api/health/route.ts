import { NextResponse } from "next/server";

const WEB_RELEASE_MARKER = "WHATSAPP_PHONE_PAIRING_TWO_MINUTE_TTL_GUARD_V117";

export function GET() {
  return NextResponse.json({
    service: "logivya-web",
    status: "healthy",
    releaseMarker: WEB_RELEASE_MARKER,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || null,
    timestamp: new Date().toISOString(),
  });
}
