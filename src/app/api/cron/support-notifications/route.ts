import { NextResponse } from "next/server";
import { processSupportNotificationOutbox } from "@/server/support/notifications";

async function run(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await processSupportNotificationOutbox(50)) });
}

export const GET = run;
export const POST = run;
