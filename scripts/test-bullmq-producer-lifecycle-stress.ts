import { Queue } from "bullmq";
import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";

const cycles = Math.max(1, Math.min(5_000, Number(process.env.QUEUE_LIFECYCLE_STRESS_CYCLES || 500)));
const nonce = `${process.pid}-${Date.now()}`;
const connection = redisConnectionOptions();
const queueNames = ["campaign", "dead-letter", "message", "sync"].map(
  (purpose) => `logivya-lifecycle-stress-${purpose}-${nonce}`,
);
const queueErrors: string[] = [];
const unhandledRejections: string[] = [];
const unhandledRejectionListener = (reason: unknown) => {
  unhandledRejections.push(reason instanceof Error ? reason.message : String(reason));
};
process.on("unhandledRejection", unhandledRejectionListener);

const queues = queueNames.map((name) => {
  const queue = new Queue(name, { connection });
  queue.on("error", (error) => queueErrors.push(error.message));
  return queue;
});
const inspector = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

function countClients(clientList: string) {
  return clientList.split("\n").filter((line) => line.trim().length > 0).length;
}

async function main() {
  try {
    await inspector.connect();
    await Promise.all(queues.map((queue) => queue.waitUntilReady()));
    const clientsBefore = countClients(await inspector.client("LIST"));

    for (let cycle = 0; cycle < cycles; cycle += 1) {
      for (const queue of queues) {
        const job = await queue.add("lifecycle-probe", { cycle }, { jobId: `probe-${cycle}` });
        const stored = await queue.getJob(job.id!);
        if (!stored) throw new Error(`QUEUE_JOB_MISSING:${queue.name}:${cycle}`);
        await stored.remove();
      }
    }

    const clientsAfter = countClients(await inspector.client("LIST"));
    if (clientsAfter !== clientsBefore) {
      throw new Error(`REDIS_CLIENT_COUNT_CHANGED:${clientsBefore}->${clientsAfter}`);
    }
    if (queueErrors.length) throw new Error(`QUEUE_ERRORS:${queueErrors.join("|")}`);
    if (unhandledRejections.length) {
      throw new Error(`UNHANDLED_REJECTIONS:${unhandledRejections.join("|")}`);
    }

    console.log(JSON.stringify({
      result: "PASS",
      cycles,
      queueOperations: cycles * queues.length,
      clientsBefore,
      clientsAfter,
      queueErrors: queueErrors.length,
      unhandledRejections: unhandledRejections.length,
    }));
  } finally {
    await Promise.all(queues.map(async (queue) => {
      await queue.drain(true).catch(() => undefined);
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close().catch(() => undefined);
    }));
    await inspector.quit().catch(() => inspector.disconnect());
    process.off("unhandledRejection", unhandledRejectionListener);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
