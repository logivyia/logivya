import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { RedisSendSafetyStore } from "../src/server/whatsapp/send-safety";
import { WhatsAppSendSafety } from "../src/server/whatsapp/send-safety-policy";

async function main() {
const url = new URL(process.env.TEST_REDIS_URL || "redis://127.0.0.1:16379");
assert.ok(["127.0.0.1", "localhost", "logivya-send-safety-test"].includes(url.hostname), "Only a dedicated local/test Redis is allowed");
assert.equal(url.protocol, "redis:");
const prefix = `logivya:test:send-safety:${randomUUID()}`;
const clients = [new Redis(url.href), new Redis(url.href)];
const stores = clients.map((redis) => new RedisSendSafetyStore(redis, prefix));
try {
  const reservations = await Promise.all(Array.from({ length: 200 }, (_, index) => stores[index % 2].reserve("atomic", 5000)));
  assert.equal(reservations.filter((wait) => wait === 0).length, 1);
  assert.ok(reservations.every((wait) => wait >= 0 && wait <= 5000));
  const starts: number[] = [];
  const gates = stores.map((store) => new WhatsAppSendSafety(store, 40));
  await Promise.all(Array.from({ length: 10 }, (_, index) => gates[index % 2].send("concurrent", async () => starts.push(Date.now()))));
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 39, "Concurrent dispatches must be spaced");
  await assert.rejects(gates[0].send("restricted", async () => { throw { output: { statusCode: 429 } }; }), /WHATSAPP_SEND_PAUSED/);
  const restarted = new WhatsAppSendSafety(stores[1], 40);
  await assert.rejects(restarted.send("restricted", async () => assert.fail("restricted account dispatched")), /WHATSAPP_SEND_PAUSED/);
  assert.ok(await stores[1].pauseRemainingMs("restricted") > 290_000);
  await restarted.send("other", async () => undefined);
  console.log(JSON.stringify({ ok: true, atomicCompetitors: 200, permitsGranted: 1, concurrentDispatches: starts.length, pauseSurvivesNewClient: true, otherAccountUnaffected: true }));
} finally {
  // Only this test's explicit keys; never flush a Redis database.
  for (const account of ["atomic", "concurrent", "restricted", "other"]) {
    await clients[0].del(`${prefix}:{${account}}:interval`, `${prefix}:{${account}}:paused`);
  }
  await Promise.all(clients.map((client) => client.quit()));
}

}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
