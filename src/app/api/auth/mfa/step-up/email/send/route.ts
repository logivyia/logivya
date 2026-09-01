import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { startEmailStepUp } from "@/server/security/mfa-settings";

export async function POST(request: Request) {
  try {
    const context = await requireApiSession();
    return NextResponse.json(await startEmailStepUp({ userId: context.user.id, companyId: context.company.id, channel: "WEB", request }), { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MFA_ERROR" }, { status: 400 });
  }
}
