import { NextResponse } from "next/server";

const WEB_RELEASE_MARKER = "WHATSAPP_PAIRING_SKIP_401_SAME_CODE_REFRESH_V125";

export function GET() {
  return NextResponse.json({
    service: "logivya-web",
    status: "healthy",
    releaseMarker: WEB_RELEASE_MARKER,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || null,
    timestamp: new Date().toISOString(),
  });
}
