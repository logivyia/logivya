import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const recovery = read("src/server/queues/recovery.ts");
const worker = read("src/worker/index.ts");

for (const name of ["campaign", "deadLetter", "message", "sync"]) {
  assert(worker.includes(`${name}:`), `Long-lived producer queue missing: ${name}`);
}

assert(
  worker.includes("reconcileDurableMessageQueues({") &&
    worker.includes("sendQueue: producerQueues.message") &&
    worker.includes("recurringQueue: producerQueues.campaign"),
  "Queue recovery must reuse the worker-owned producer queues.",
);
assert(
  worker.includes("}, producerQueues.campaign);"),
  "Recurring scheduling must reuse the worker-owned campaign queue.",
);
assert(
  !worker.includes("const reconnectQueue = whatsappQueue()") &&
    !worker.includes("const queue = deadLetterQueue()") &&
    !worker.includes("const queue = messageQueue()"),
  "Worker job handlers must not create short-lived producer queues.",
);
assert(
  recovery.includes("const ownsQueue = !recurringQueue") &&
    recovery.includes("if (ownsQueue) await queue.close()"),
  "Recurring helper must close only queues it owns.",
);
assert(
  recovery.includes("const ownsSendQueue = !clients?.sendQueue") &&
    recovery.includes("if (ownsSendQueue) await sendQueue.close()"),
  "Recovery must not close an injected message queue.",
);
assert(
  recovery.includes("const ownsRecurringQueue = !clients?.recurringQueue") &&
    recovery.includes("if (ownsRecurringQueue) await recurringQueue.close()"),
  "Recovery must not close an injected campaign queue.",
);
assert(
  worker.includes('queue.on("error"') && worker.includes('"worker.producer_queue.error"'),
  "Every long-lived producer queue must have an error listener.",
);
assert(
  worker.includes("producerQueueEntries.map") && worker.includes("queue.close()") &&
    worker.indexOf("producerQueueEntries.map") > worker.indexOf("workers.map"),
  "Producer queues must close once, after consumers, during controlled shutdown.",
);

console.log("Worker producer queue lifecycle contracts passed.");
