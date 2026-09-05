import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import { RedisSendSafetyStore } from "../src/server/whatsapp/send-safety";
import { deferCampaignForPacing } from "../src/server/messages/campaign-pacing";

async function main() {
  const url = new URL(process.env.TEST_REDIS_URL || "redis://127.0.0.1:16379");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  const id = randomUUID(); const prefix = `logivya:test:pacing:${id}`;
  const clients = [new Redis(url.href), new Redis(url.href)];
  const stores = clients.map(client => new RedisSendSafetyStore(client, prefix));
  const connection = { host: url.hostname, port: Number(url.port), maxRetriesPerRequest: null };
  const queue = new Queue(`pacing-${id}`, { connection });
  let worker: Worker | undefined;
  try {
    // The actual production interval: competing recipients count only once.
    const first = await Promise.all(Array.from({length: 100}, (_, i) => stores[i % 2].reserveCampaign("account", "one")));
    assert.ok(first.every(wait => wait === 0));
    assert.equal(await stores[1].reserveCampaign("account", "two"), 0);
    const third = await stores[0].reserveCampaign("account", "three");
    const fourth = await stores[1].reserveCampaign("account", "four");
    const fifth = await stores[0].reserveCampaign("account", "five");
    assert.ok(third > 299_000 && third <= 300_000);
    assert.ok(Math.abs(fourth - third) < 1000);
    assert.ok(fifth > 599_000 && fifth <= 600_000);
    const restarted = new RedisSendSafetyStore(clients[1], prefix);
    assert.equal(await restarted.reserveCampaign("account", "one"), 0);
    assert.ok(await restarted.reserveCampaign("account", "three") > 298_000);
    assert.equal(await restarted.reserveCampaign("other", "three"), 0);
    await stores[0].pause("account", 120);
    assert.ok(await restarted.reserveCampaign("account", "one") > 0);
    await new Promise(resolve => setTimeout(resolve, 140));
    assert.equal(await restarted.reserveCampaign("account", "one"), 0);

    // Real BullMQ delay path: four campaigns, two recipients each. No sending
    // callback can run before admission, and delays consume no failure attempts.
    const starts = new Map<string, number>(); const failed: string[] = [];
    worker = new Worker(queue.name, async (job, token) => {
      await deferCampaignForPacing(job, "queue-account", job.data.campaign, token,
        (account, campaign) => restarted.reserveCampaign(account, campaign, 400));
      if (!starts.has(job.data.campaign)) starts.set(job.data.campaign, Date.now());
      return { simulated: true };
    }, { connection, concurrency: 8 });
    worker.on("failed", (_job, error) => failed.push(error.message));
    await queue.addBulk(Array.from({length: 8}, (_, i) => ({name: "recipient", data: {campaign: `c${Math.floor(i / 2)}`}, opts: {attempts: 1}})));
    const end = Date.now() + 10_000;
    while (await queue.getCompletedCount() < 8 && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await queue.getCompletedCount(), 8);
    assert.equal(await queue.getFailedCount(), 0); assert.deepEqual(failed, []);
    const times = [...starts.values()].sort((a,b) => a-b);
    assert.equal(times.length, 4); assert.ok(times[2] - times[1] >= 390);
    const jobs = await queue.getCompleted(); assert.ok(jobs.every(job => job.attemptsMade === 1));
    console.log(JSON.stringify({ok:true,competingRecipients:100,firstPairImmediate:true,thirdPairWaitMs:third,nextPairWaitMs:fifth,restartAndAccountIsolation:true,realQueueRecipients:8,noFailures:true,noMessagesSent:true}));
  } finally {
    await worker?.close(); await queue.obliterate({force:true}); await queue.close();
    const keys = await clients[0].keys(`${prefix}:*`);
    if(keys.length) await clients[0].del(...keys);
    await Promise.all(clients.map(client=>client.quit()));
  }
}
void main().catch(error => {console.error(error); process.exitCode=1;});
