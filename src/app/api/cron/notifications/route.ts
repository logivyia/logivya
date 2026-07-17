import { NextResponse } from "next/server";
import { drainNotificationOutbox, enforceNotificationRetention, processNotificationAudienceExpansions } from "@/server/notifications/engine";
import { processExpoPushReceipts } from "@/server/notifications/expo-receipts";
import { writeNotificationWorkerHeartbeat } from "@/server/notifications/worker-heartbeat";

async function run(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const audience = await processNotificationAudienceExpansions(20, 250);
    const outbox = await drainNotificationOutbox(20, 100);
    const receipts = await processExpoPushReceipts(1_000).catch((error) => ({ error: error instanceof Error ? error.message : "EXPO_RECEIPTS_FAILED" }));
    const retention = await enforceNotificationRetention();
    const processed = audience.recipients + outbox.claimed + ("requested" in receipts ? receipts.requested : 0);
    await writeNotificationWorkerHeartbeat({
      workerId: "vercel-notification-cron",
      mode: "cron",
      status: "HEALTHY",
      lastHeartbeatAt: new Date().toISOString(),
      release: process.env.LOG_RELEASE_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || null,
      cycleMs: Date.now() - startedAt,
      processed,
    });
    return NextResponse.json({ ok: true, audience, outbox, receipts, retention });
  } catch (error) {
    await writeNotificationWorkerHeartbeat({
      workerId: "vercel-notification-cron",
      mode: "cron",
      status: "DEGRADED",
      lastHeartbeatAt: new Date().toISOString(),
      release: process.env.LOG_RELEASE_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || null,
      cycleMs: Date.now() - startedAt,
      processed: 0,
      lastErrorCode: "NOTIFICATION_CRON_FAILED",
    }).catch(() => undefined);
    throw error;
  }
}

export const GET = run;
export const POST = run;
