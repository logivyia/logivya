import { NextResponse } from "next/server";

import { webSocialIdentityConfiguration } from "@/server/auth/social-identity";

export async function GET() {
  return NextResponse.json(webSocialIdentityConfiguration(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
