import { NextResponse } from "next/server";

import { drainInvitationDeliveryOutbox } from "@/server/team/invitation-delivery";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return NextResponse.json(await drainInvitationDeliveryOutbox());
}
