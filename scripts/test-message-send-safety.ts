import assert from "node:assert/strict";
import { test } from "node:test";
import { uniqueSelectedGroupIds, uniqueGroupDeliveryTargets } from "../src/server/messages/unique-targets";
import { WhatsAppSendSafety, sendIntervalMs, isWhatsAppSendRestriction, SEND_RESTRICTION_COOLDOWN_MS, type SendSafetyStore } from "../src/server/whatsapp/send-safety-policy";

test("50 + 50 group selections with two overlaps produce exactly 98 destinations", () => {
  const a = Array.from({ length: 50 }, (_, i) => ({ groupId: `group-${i}` }));
  const b = Array.from({ length: 50 }, (_, i) => ({ groupId: `group-${i + 48}` }));
  const ids = uniqueSelectedGroupIds(["group-48", "group-49"], [...a, ...b, ...a]);
  assert.equal(ids.length, 98);
  assert.equal(ids.filter((id) => id === "group-48").length, 1);
  assert.equal(uniqueSelectedGroupIds([], [...a, ...Array.from({ length: 50 }, (_, i) => ({ groupId: `group-${i + 49}` }))]).length, 99);
});

test("final delivery identity deduplication is scoped to account and never matches group names", () => {
  const records = [
    { id: "a", accountId: "owner-1", externalGroupId: "12000@g.us" },
    { id: "alias", accountId: "owner-1", externalGroupId: "12000@g.us " },
    { id: "different", accountId: "owner-1", externalGroupId: "12001@g.us" },
    { id: "other-owner", accountId: "owner-2", externalGroupId: "12000@g.us" },
  ];
  assert.deepEqual(uniqueGroupDeliveryTargets(records).map((group) => group.id), ["a", "different", "other-owner"]);
  assert.throws(() => uniqueGroupDeliveryTargets([{ ...records[0], externalGroupId: " " }]), /MESSAGE_TARGET_MISSING/);
});

class MemoryStore implements SendSafetyStore {
  next = new Map<string, number>();
  paused = new Map<string, number>();
  unavailable = false;
  constructor(readonly now: () => number) {}
  async reserve(account: string, interval: number) {
    if (this.unavailable) throw new Error("offline");
    if ((this.paused.get(account) ?? 0) > this.now()) return -1;
    const wait = (this.next.get(account) ?? 0) - this.now();
    if (wait > 0) return wait;
    this.next.set(account, this.now() + interval);
    return 0;
  }
  async pause(account: string, duration: number) {
    if (this.unavailable) throw new Error("offline");
    this.paused.set(account, this.now() + duration);
  }
}

test("100 queued sends and a restarted gate maintain six-second spacing, including retries and attachment parts", async () => {
  let time = 1000;
  const store = new MemoryStore(() => time);
  const wait = async (ms: number) => { time += ms; };
  let gate = new WhatsAppSendSafety(store, sendIntervalMs({}), wait, () => time);
  const starts: number[] = [];
  for (let i = 0; i < 100; i++) {
    if (i === 50) gate = new WhatsAppSendSafety(store, sendIntervalMs({}), wait, () => time);
    await gate.send("account", async () => { starts.push(time); return { messageKey: i }; });
  }
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 6000);
  assert.equal(starts.at(-1)! - starts[0], 594_000);
  await assert.rejects(gate.send("account", async () => { starts.push(time); throw new Error("transient"); }), /transient/);
  await gate.send("account", async () => { assert.ok(time - starts.at(-1)! >= 6000); });
  await gate.send("other-account", async () => assert.equal(time, 607_000));
});

test("concurrent campaigns share the same account's permits", async () => {
  const store = new MemoryStore(Date.now);
  const one = new WhatsAppSendSafety(store, 20);
  const two = new WhatsAppSendSafety(store, 20);
  const starts: number[] = [];
  await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? one : two).send("shared-account", async () => { starts.push(Date.now()); })));
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 20);
});

test("restriction stops this account across restarts; other accounts can continue", async () => {
  let time = 1000;
  const store = new MemoryStore(() => time);
  const gate = () => new WhatsAppSendSafety(store, 5000, async (ms) => { time += ms; }, () => time);
  await assert.rejects(gate().send("restricted", async () => { throw { output: { statusCode: 429 } }; }), /WHATSAPP_SEND_PAUSED/);
  let dispatched = 0;
  await assert.rejects(gate().send("restricted", async () => { dispatched++; }), /WHATSAPP_SEND_PAUSED/);
  assert.equal(dispatched, 0);
  await gate().send("other", async () => { dispatched++; });
  assert.equal(dispatched, 1);
  time += SEND_RESTRICTION_COOLDOWN_MS;
  await gate().send("restricted", async () => { dispatched++; });
  assert.equal(dispatched, 2);
});

test("Redis outage cannot send, and successful message keys are returned without a second store write", async () => {
  const store = new MemoryStore(Date.now);
  const gate = new WhatsAppSendSafety(store, 5000);
  store.unavailable = true;
  await assert.rejects(gate.send("a", async () => assert.fail("must not dispatch")), /WHATSAPP_SEND_SAFETY_UNAVAILABLE/);
  store.unavailable = false;
  const result = await gate.send("a", async () => { store.unavailable = true; return { key: "delivered" }; });
  assert.equal(result.key, "delivered");
});

test("a failed restriction write is retried before any later dispatch", async () => {
  const store = new MemoryStore(Date.now);
  const gate = new WhatsAppSendSafety(store, 5000);
  await assert.rejects(gate.send("a", async () => { store.unavailable = true; throw { statusCode: 429 }; }), /WHATSAPP_SEND_SAFETY_UNAVAILABLE/);
  store.unavailable = false;
  await assert.rejects(gate.send("a", async () => assert.fail("must remain paused")), /WHATSAPP_SEND_PAUSED/);
});

test("invalid configuration cannot increase the send rate; group permissions are not classified as an account ban", () => {
  for (const value of ["0", "-5", "NaN", "Infinity", "1500"]) assert.ok(sendIntervalMs({ WHATSAPP_MIN_DELAY_MS: value }) >= 6000);
  assert.equal(sendIntervalMs({ WHATSAPP_MAX_MESSAGES_PER_MINUTE: "6" }), 10_000);
  assert.equal(isWhatsAppSendRestriction({ output: { statusCode: 403 }, message: "not a group admin" }), false);
});
