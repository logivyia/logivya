import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const schema = read("prisma/schema.prisma");
const recovery = read("src/server/queues/recovery.ts");
const worker = read("src/worker/index.ts");
const pipeline = read("src/server/messages/delivery-pipeline.ts");

for (const marker of ["nextRunAt", "recurringOccurrenceKey", "@@index([scheduleType, status, nextRunAt])"]) {
  assert(schema.includes(marker), `Durable queue schema marker missing: ${marker}`);
}
for (const marker of [
  "reconcileDurableMessageQueues",
  "resetStaleDeletes",
  'deleteForEveryoneStatus: "PROCESSING"',
  "recovery-recipient-${recipient.id}",
  "recovery-delete-${recipient.id}",
  "recurringJobId(template.id, runAt.getTime())",
  'status: "SENDING"',
  'data: { status: "RETRYING"',
]) {
  assert(recovery.includes(marker), `Queue recovery contract missing: ${marker}`);
}
assert(worker.includes("scheduleFollowingRecurringRun"), "Recurring worker must persist and enqueue the following run.");
assert(worker.includes("recurringOccurrenceKey"), "Recurring worker must use a durable occurrence idempotency key.");
assert(worker.includes("reconcileDurableMessageQueues"), "Worker startup must reconcile PostgreSQL scheduling state into Redis.");
assert(worker.includes('if (!claimed.count) {'), "Delete processing must stop when another job owns the durable claim.");
assert(pipeline.includes("nextRunAt: firstRecurringRunAt"), "Recurring campaign creation must persist its first run time.");
assert(pipeline.includes("runAt: nextRunAt.toISOString()"), "Recurring jobs must carry their exact durable run time.");

console.log("Durable queue recovery contracts passed.");
