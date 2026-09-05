import { setTimeout as sleep } from "node:timers/promises";

import {
  cleanupExpiredFacebookMedia,
  cleanupExpiredFacebookOAuthTransactions,
  facebookPublicationQueueHealth,
  processNextFacebookPublication,
  recoverStaleFacebookPublications,
} from "../src/server/facebook/posts";

const once = process.argv.includes("--once");
const pollMs = Math.min(60_000, Math.max(1_000, Number(process.env.FACEBOOK_PUBLICATION_WORKER_POLL_MS || 5_000)));
const batchSize = Math.min(50, Math.max(1, Number(process.env.FACEBOOK_PUBLICATION_WORKER_BATCH_SIZE || 10)));
const workerId = process.env.FACEBOOK_PUBLICATION_WORKER_ID || `facebook-publication-worker:${process.pid}`;
let stopping = false;
let lastRetentionAt = 0;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function cycle() {
  let claimed = 0;
  let delivered = 0;
  let retried = 0;
  let failed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const result = await processNextFacebookPublication(workerId);
    if (!result.processed) break;
    claimed += 1;
    if (result.delivered) delivered += 1;
    else if (result.retryable) retried += 1;
    else failed += 1;
  }
  return { claimed, delivered, retried, failed };
}

async function main() {
  const recovered = await recoverStaleFacebookPublications();
  console.log(JSON.stringify({ level: "info", event: "facebook.publication_worker.started", workerId, recovered: recovered.count }));
  while (!stopping) {
    const startedAt = new Date().toISOString();
    try {
      const result = await cycle();
      const health = await facebookPublicationQueueHealth();
      let retention: { mediaDeleted: number; oauthDeleted: number } | null = null;
      if (Date.now() - lastRetentionAt >= 60 * 60_000) {
        const [media, oauth] = await Promise.all([
          cleanupExpiredFacebookMedia(),
          cleanupExpiredFacebookOAuthTransactions(),
        ]);
        retention = { mediaDeleted: media.deleted, oauthDeleted: oauth.count };
        lastRetentionAt = Date.now();
      }
      console.log(JSON.stringify({ level: "info", event: "facebook.publication_worker.cycle", workerId, startedAt, ...result, ...health, retention }));
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "facebook.publication_worker.cycle_failed",
        workerId,
        startedAt,
        errorCode: error instanceof Error ? error.message : "FACEBOOK_PUBLICATION_WORKER_FAILED",
      }));
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
