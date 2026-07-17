import { NextResponse } from "next/server";
import { drainNotificationOutbox, enforceNotificationRetention, processNotificationAudienceExpansions } from "@/server/notifications/engine";
import { processExpoPushReceipts } from "@/server/notifications/expo-receipts";

async function run(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const audience = await processNotificationAudienceExpansions(20, 250);
  const outbox = await drainNotificationOutbox(20, 100);
  const receipts = await processExpoPushReceipts(1_000).catch((error) => ({ error: error instanceof Error ? error.message : "EXPO_RECEIPTS_FAILED" }));
  const retention = await enforceNotificationRetention();
  return NextResponse.json({ ok: true, audience, outbox, receipts, retention });
}

export const GET = run;
export const POST = run;
