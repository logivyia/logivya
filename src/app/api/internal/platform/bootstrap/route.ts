import { NextResponse } from "next/server";
import { ensureInitialPlatformAdminInvite } from "@/server/auth/platform-bootstrap";
import { isInternalJobAuthorized } from "@/server/security/internal-job-auth";

export async function POST(request: Request) {
  if (!isInternalJobAuthorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const invite = await ensureInitialPlatformAdminInvite();
  return NextResponse.json({ created: Boolean(invite), email: invite?.email });
}
