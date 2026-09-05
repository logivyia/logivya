import assert from "node:assert/strict";
import type { Prisma, Subscription } from "@prisma/client";
import { isInternalJobAuthorized } from "../src/server/security/internal-job-auth";
import { readBoundedRequestText, RequestBodyError } from "../src/server/security/request-body";
import { expireCompanySubscriptions, isSubscriptionDueForExpiration } from "../src/server/billing/subscription-expiration";

const now = new Date("2026-09-05T00:00:00Z");
const past = new Date("2026-09-01T00:00:00Z");
const future = new Date("2026-10-01T00:00:00Z");
const req = (authorization: string) => new Request("https://example.invalid/internal", { headers: { authorization } });
for (const secret of [undefined, "", " "]) for (const bearer of ["Bearer undefined", "Bearer null", "Bearer ", "Bearer attacker"]) {
  assert.equal(isInternalJobAuthorized(req(bearer), secret), false);
}
assert.equal(isInternalJobAuthorized(req("Bearer correct-secret"), "correct-secret"), true);
assert.equal(isInternalJobAuthorized(req("Bearer wrongg-secret"), "correct-secret"), false);
assert.equal(isInternalJobAuthorized(req("Basic correct-secret"), "correct-secret"), false);

const base = { status: "ACTIVE", endsAt: past, currentPeriodEndsAt: past, trialEndsAt: null } as Subscription;
assert.equal(isSubscriptionDueForExpiration(base, now), true);
assert.equal(isSubscriptionDueForExpiration({ ...base, currentPeriodEndsAt: future }, now), false);
assert.equal(isSubscriptionDueForExpiration({ ...base, endsAt: null, currentPeriodEndsAt: null }, now), false);
assert.equal(isSubscriptionDueForExpiration({ ...base, status: "CANCELLED" }, now), false);

function fixture(renewed: boolean, updateWins = true) {
  const rows = [{ ...base, id: "old-plan", companyId: "workspace-test" }];
  const current = { ...base, id: "new-plan", companyId: "workspace-test", startsAt: past, currentPeriodStartsAt: past, trialStartsAt: null, endsAt: future, currentPeriodEndsAt: future, plan: { slug: "professional" } };
  const observed = { locks: 0, events: 0, notifications: 0, memberUpdates: 0 };
  const tx = {
    $queryRaw: async () => { observed.locks++; return [{ id: "workspace-test", ownerId: "owner-test" }]; },
    subscription: {
      findMany: async (args: { include?: unknown }) => args.include ? (renewed ? [current] : []) : rows.filter(row => row.status === "ACTIVE"),
      updateMany: async () => { assert.equal(observed.locks, 1); if (!updateWins) return { count: 0 }; rows[0].status = "EXPIRED"; return { count: 1 }; },
    },
    subscriptionEvent: { create: async () => { observed.events++; } },
    subscriptionAuditLog: { create: async () => undefined },
    trialEntitlement: { updateMany: async () => ({ count: 0 }) },
    companyUser: {
      findMany: async () => [{ id: "member-test", userId: "user-test" }],
      updateMany: async () => { observed.memberUpdates++; return { count: 1 }; },
    },
    auditLog: { createMany: async () => undefined },
    notification: {
      create: async () => { observed.notifications++; },
      createMany: async () => { observed.notifications++; },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, observed };
}
async function main() {
  const renewed = fixture(true);
  assert.deepEqual(await expireCompanySubscriptions(renewed.tx, "workspace-test", now), { expired: 1, membersExpired: 0 });
  assert.equal(renewed.observed.notifications, 0, "renewed workspace must not receive an expired notice");
  assert.equal(renewed.observed.memberUpdates, 0, "renewed workspace members retain access");
  const ended = fixture(false);
  assert.deepEqual(await expireCompanySubscriptions(ended.tx, "workspace-test", now), { expired: 1, membersExpired: 1 });
  assert.deepEqual(await expireCompanySubscriptions(ended.tx, "workspace-test", now), { expired: 0, membersExpired: 0 });
  assert.equal(ended.observed.events, 1, "retry must not duplicate the lifecycle event");
  assert.equal(ended.observed.notifications, 2, "owner/member notifications occur once");
  const race = fixture(false, false);
  assert.deepEqual(await expireCompanySubscriptions(race.tx, "workspace-test", now), { expired: 0, membersExpired: 0 });
  assert.equal(race.observed.notifications, 0, "lost compare-and-update must have no side effects");
  for (const headers of [{}, { "content-length": "1" }]) {
    let canceled = false;
    const request = new Request("https://example.invalid/events", { method: "POST", headers,
      body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4097)); }, cancel() { canceled = true; } }), duplex: "half",
    } as RequestInit);
    await assert.rejects(readBoundedRequestText(request, 4096, 100), (error: unknown) => error instanceof RequestBodyError && error.status === 413);
    assert.equal(canceled, true);
  }
  const slow = new Request("https://example.invalid/events", { method: "POST", body: new ReadableStream({ pull() {} }), duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedRequestText(slow, 4096, 25), (error: unknown) => error instanceof RequestBodyError && error.status === 408);
  console.log("Internal auth bypasses denied; renewal/idempotency preserved; dishonest and slow body streams rejected.");
}
void main();
