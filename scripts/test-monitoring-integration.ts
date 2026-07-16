import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const health = readFileSync("src/server/monitoring/health.ts", "utf8");
const admin = readFileSync("src/app/api/admin/system/health/route.ts", "utf8");
const mobile = readFileSync("apps/mobile/src/api/mobileAdmin.ts", "utf8");
const worker = readFileSync("src/server/whatsapp/worker-heartbeat.ts", "utf8");
const queue = readFileSync("src/server/queues/health.ts", "utf8");
const vercel = readFileSync("vercel.json", "utf8");

for (const marker of ["checkDatabaseHealth", "checkRedisHealth", "checkQueuesHealth", "checkWorkerHealth", "checkWhatsAppHealth", "checkMessagingAndSchedulerHealth", "checkSupportAndEmailHealth", "checkAuthAndSubscriptionHealth", "checkBackupAndDeploymentHealth"]) {
  assert(health.includes(marker), `Missing monitoring integration: ${marker}`);
}
assert(admin.includes("requirePlatformAdmin"));
assert(admin.includes("getSystemHealthSnapshot"));
assert(mobile.includes("updateAdminIncident"));
assert(mobile.includes('recordType: "SERVICE"'));
for (const field of ["workerId", "service", "environment", "release", "queueNames", "startedAt", "lastHeartbeatAt", "currentJobs", "capacity", "status"]) assert(worker.includes(field));
for (const field of ["oldestWaitingAgeMs", "throughputPerMinute", "p95ProcessingMs", "p99ProcessingMs", "workerCount"]) assert(queue.includes(field));
assert(vercel.includes("/api/cron/monitoring"));

async function main() {
  const baseUrl = process.env.MONITORING_TEST_BASE_URL?.replace(/\/$/, "");
  if (baseUrl) {
    const [live, ready] = await Promise.all([fetch(`${baseUrl}/api/health/live`), fetch(`${baseUrl}/api/health/ready`)]);
    assert.equal(live.status, 200);
    assert.deepEqual(Object.keys(await live.json()), ["status"]);
    assert([200, 503].includes(ready.status));
  }
  process.stdout.write(`Monitoring integration contracts passed${baseUrl ? " with live endpoint checks" : " (live endpoint checks not requested)"}.\n`);
}

void main();
