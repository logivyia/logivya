import assert from "node:assert/strict";
import { prisma } from "../src/server/db";
import { expireCompanySubscriptions } from "../src/server/billing/subscription-expiration";
import { boundedDatabaseText } from "../src/server/security/database-text";
import { testDurableDeliveryCrash } from "./test-delivery-intent-isolated";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.LOGIVYA_ISOLATED_TEST !== "1" || url.hostname !== "astra-expiration-db" || url.pathname !== "/astra_isolated") {
  throw new Error("ISOLATED_DATABASE_REQUIRED");
}
const now = new Date("2026-09-05T00:00:00Z");
const past = new Date("2026-09-01T00:00:00Z");
const future = new Date("2026-10-01T00:00:00Z");
async function fixture(prefix: string) {
  const owner = await prisma.user.create({ data: { name: "Synthetic owner", username: `${prefix}-owner`, email: `${prefix}-owner@example.invalid`, passwordHash: "unusable-test-only" } });
  const member = await prisma.user.create({ data: { name: "Synthetic member", username: `${prefix}-member`, email: `${prefix}-member@example.invalid`, passwordHash: "unusable-test-only" } });
  const company = await prisma.company.create({ data: { name: `Isolated ${prefix}`, ownerId: owner.id } });
  const plan = await prisma.plan.create({ data: { name: "Test plan", slug: `${prefix}-plan`, maxWhatsappAccounts: 1, maxGroups: 1, maxMessagesPerDay: 1, maxMessagesPerMonth: 1 } });
  const subscription = await prisma.subscription.create({ data: { companyId: company.id, planId: plan.id, status: "ACTIVE", endsAt: past, currentPeriodEndsAt: past } });
  await prisma.companyUser.create({ data: { companyId: company.id, userId: member.id, role: "OPERATOR", status: "ACTIVE", lifecycleState: "ACTIVE_SHARED_MEMBER" } });
  return { company, subscription };
}
async function main() {
  await testDurableDeliveryCrash();
  const unicode = "x".repeat(1999) + "🚚";
  await assert.rejects(prisma.$queryRaw`SELECT ${JSON.stringify({ text: unicode.slice(0, 2000) })}::jsonb`);
  const valid = await prisma.$queryRaw<Array<{ text: string }>>`SELECT (${JSON.stringify({ text: boundedDatabaseText(unicode, 2000) })}::jsonb)->>'text' AS text`;
  assert.equal(valid[0].text, "x".repeat(1999));
  const renewed = await fixture("renewal");
  let acquired!: () => void;
  let release!: () => void;
  const locked = new Promise<void>(resolve => { acquired = resolve; });
  const releaseLock = new Promise<void>(resolve => { release = resolve; });
  const renewal = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${renewed.company.id} FOR UPDATE`;
    await tx.subscription.update({ where: { id: renewed.subscription.id }, data: { endsAt: future, currentPeriodEndsAt: future } });
    acquired();
    await releaseLock;
  }, { timeout: 10_000 });
  await locked;
  let expirationFinished = false;
  const expiration = prisma.$transaction(tx => expireCompanySubscriptions(tx, renewed.company.id, now), { timeout: 10_000 })
    .then(value => { expirationFinished = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(expirationFinished, false, "expiration must wait on renewal's company lock");
  release();
  await renewal;
  assert.deepEqual(await expiration, { expired: 0, membersExpired: 0 });
  assert.equal(await prisma.notification.count({ where: { companyId: renewed.company.id } }), 0);
  assert.equal((await prisma.companyUser.findFirstOrThrow({ where: { companyId: renewed.company.id } })).lifecycleState, "ACTIVE_SHARED_MEMBER");

  const expired = await fixture("expiry");
  const runs = await Promise.all([1, 2].map(() => prisma.$transaction(tx => expireCompanySubscriptions(tx, expired.company.id, now), { timeout: 10_000 })));
  assert.equal(runs.reduce((sum, run) => sum + run.expired, 0), 1);
  assert.equal(await prisma.subscriptionEvent.count({ where: { companyId: expired.company.id } }), 1);
  assert.equal(await prisma.notification.count({ where: { companyId: expired.company.id } }), 2);

  const rollback = await fixture("rollback");
  await assert.rejects(prisma.$transaction(async tx => {
    await expireCompanySubscriptions(tx, rollback.company.id, now);
    throw new Error("SYNTHETIC_CRASH_BEFORE_COMMIT");
  }), /SYNTHETIC_CRASH_BEFORE_COMMIT/);
  assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: rollback.subscription.id } })).status, "ACTIVE");
  assert.equal(await prisma.notification.count({ where: { companyId: rollback.company.id } }), 0);
  console.log(JSON.stringify({ ok: true, isolated: true, unicodeJsonbRegression: "reproduced-and-fixed", renewalRace: "pass", concurrentExpiration: "once", rollback: "atomic", productionDataUsed: false }));
}
main().finally(() => prisma.$disconnect());
