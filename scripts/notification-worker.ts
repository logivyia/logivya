import { setTimeout as sleep } from "node:timers/promises";

import { processExpoPushReceipts } from "../src/server/notifications/expo-receipts";
import { drainNotificationOutbox, enforceNotificationRetention, processNotificationAudienceExpansions } from "../src/server/notifications/engine";
import { writeNotificationWorkerHeartbeat } from "../src/server/notifications/worker-heartbeat";
import { processPendingMarketplaceMatchNotifications } from "../src/server/freight/demand-matching";
import { enforceFreightCandidateRetention } from "../src/server/freight/smart-ingestion";
import { expireMarketplaceListings } from "../src/server/freight/expiration";
import {
  processPendingFreightCandidates,
  processPendingSmartMatchingJobs,
  processPendingSmartMatchSummaryNotifications,
} from "../src/server/freight/smart-matching";

const once = process.argv.includes("--once");
const pollMs = Math.min(60_000, Math.max(1_000, Number(process.env.NOTIFICATION_WORKER_POLL_MS || 5_000)));
const workerId = process.env.NOTIFICATION_WORKER_ID || `notification-worker:${process.pid}`;
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function cycle() {
  const expiredListings = await expireMarketplaceListings();
  const smartMatchingJobs = await processPendingSmartMatchingJobs(5);
  const freightCandidates = await processPendingFreightCandidates(100);
  const smartMatchNotifications = await processPendingSmartMatchSummaryNotifications(25);
  const audience = await processNotificationAudienceExpansions(20, 250);
  const marketplaceMatches = await processPendingMarketplaceMatchNotifications(100);
  const outbox = await drainNotificationOutbox(20, 100);
  const receipts = await processExpoPushReceipts(500).catch((error) => ({ error: error instanceof Error ? error.message : "EXPO_RECEIPTS_FAILED" }));
  return { expiredListings, smartMatchingJobs, freightCandidates, smartMatchNotifications, audience, marketplaceMatches, outbox, receipts };
}

async function main() {
  let cycles = 0;
  while (!stopping) {
    const startedAt = new Date().toISOString();
    const cycleStartedAt = Date.now();
    try {
      const result = await cycle();
      cycles += 1;
      const processed = result.smartMatchingJobs.claimed + result.freightCandidates.candidates + result.smartMatchNotifications.claimed + result.audience.recipients + result.marketplaceMatches.claimed + result.outbox.claimed + ("requested" in result.receipts ? result.receipts.requested : 0);
      await writeNotificationWorkerHeartbeat({ workerId, mode: "worker", status: "HEALTHY", lastHeartbeatAt: new Date().toISOString(), release: process.env.LOG_RELEASE_VERSION || process.env.RENDER_GIT_COMMIT || null, cycleMs: Date.now() - cycleStartedAt, processed });
      console.log(JSON.stringify({ level: "info", event: "notification.worker.cycle", startedAt, cycles, ...result }));
      if (cycles % 720 === 0) {
        await enforceNotificationRetention();
        await enforceFreightCandidateRetention();
      }
    } catch (error) {
      await writeNotificationWorkerHeartbeat({ workerId, mode: "worker", status: "DEGRADED", lastHeartbeatAt: new Date().toISOString(), release: process.env.LOG_RELEASE_VERSION || process.env.RENDER_GIT_COMMIT || null, cycleMs: Date.now() - cycleStartedAt, processed: 0, lastErrorCode: error instanceof Error ? error.message : "NOTIFICATION_WORKER_FAILED" }).catch(() => undefined);
      console.error(JSON.stringify({ level: "error", event: "notification.worker.cycle_failed", startedAt, errorCode: error instanceof Error ? error.message : "NOTIFICATION_WORKER_FAILED" }));
      if (once) throw error;
    }
    if (once) break;
    await sleep(pollMs);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
