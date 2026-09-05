import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveApprovedPendingReception } from "../src/server/whatsapp-ingestion/pending-delivery-policy";

const owner = { id: "owned-account", userId: "owner", companyId: "company", archivedAt: null };
const approved = {
  accountId: owner.id, userId: owner.userId, companyId: owner.companyId,
  isArchived: false, ingestionEnabled: true, ingestionApprovedAt: new Date(), ingestionPausedAt: null,
};
type Repository = Parameters<typeof resolveApprovedPendingReception>[0];

async function run(options: {
  registered?: boolean;
  control?: { globallyPaused: boolean; emergencyKillSwitch: boolean } | null;
  account?: Record<string, unknown> | null;
  group?: Record<string, unknown> | null;
  failure?: "control" | "account" | "group";
} = {}) {
  const calls: Array<{ stage: string; query: unknown }> = [];
  const account = options.account === undefined ? owner : options.account;
  const group = options.group === undefined ? approved : options.group;
  const record = (stage: string, query: unknown) => {
    calls.push({ stage, query });
    if (options.failure === stage) throw new Error("PRIVATE_DATABASE_DETAILS");
  };
  const repository = {
    whatsAppIngestionControl: { findUnique: async (query: unknown) => {
      record("control", query);
      return options.control === undefined ? { globallyPaused: false, emergencyKillSwitch: false } : options.control;
    } },
    whatsAppAccount: { findUnique: async (query: unknown) => { record("account", query); return account; } },
    whatsAppGroup: { findFirst: async (query: { where: typeof approved & { account: typeof owner }; select: { id: true } }) => {
      record("group", query);
      if (!group) return null;
      const where = query.where;
      const matches = group.accountId === where.accountId && group.userId === where.userId
        && group.companyId === where.companyId && group.isArchived === where.isArchived
        && group.ingestionEnabled === where.ingestionEnabled && group.ingestionApprovedAt != null
        && group.ingestionPausedAt === where.ingestionPausedAt;
      return matches ? { id: "approved-source" } : null;
    } },
  } as unknown as Repository;
  return { decision: await resolveApprovedPendingReception(repository, owner.id, options.registered ?? true), calls };
}

test("fresh pairing does not query or enable pending reception", async () => {
  const result = await run({ registered: false });
  assert.deepEqual(result.decision, { enabled: false, reason: "unregistered" });
  assert.equal(result.calls.length, 0);
});
for (const control of [null, { globallyPaused: true, emergencyKillSwitch: false }, { globallyPaused: false, emergencyKillSwitch: true }]) {
  test(`missing control or global stop fails closed: ${JSON.stringify(control)}`, async () => {
    const result = await run({ control });
    assert.equal(result.decision.enabled, false);
    assert.equal(result.calls.length, 1);
  });
}
for (const account of [null, { ...owner, userId: null }, { ...owner, companyId: null }, { ...owner, archivedAt: new Date() }, { ...owner, id: "wrong-account" }]) {
  test(`missing, archived or unowned account is denied: ${JSON.stringify(account)}`, async () => {
    const result = await run({ account });
    assert.equal(result.decision.enabled, false);
    assert.equal(result.decision.reason, "missing_owner");
    assert.equal(result.calls.length, 2);
  });
}
for (const group of [null, { ...approved, accountId: "other-account" }, { ...approved, userId: "other-user" }, { ...approved, companyId: "other-company" }, { ...approved, isArchived: true }, { ...approved, ingestionEnabled: false }, { ...approved, ingestionApprovedAt: null }, { ...approved, ingestionPausedAt: new Date() }]) {
  test(`foreign, paused or unapproved source is denied: ${JSON.stringify(group)}`, async () => {
    assert.deepEqual((await run({ group })).decision, { enabled: false, reason: "no_approved_source" });
  });
}
test("approved owned source enables only bounded pending protocol delivery", async () => {
  const result = await run();
  assert.deepEqual(result.decision, { enabled: true, reason: "approved_source" });
  assert.deepEqual(result.calls[2].query, {
    where: {
      accountId: owner.id, userId: owner.userId, companyId: owner.companyId,
      isArchived: false, ingestionEnabled: true, ingestionApprovedAt: { not: null }, ingestionPausedAt: null,
      account: { archivedAt: null, userId: owner.userId, companyId: owner.companyId },
    }, select: { id: true },
  });
});
for (const failure of ["control", "account", "group"] as const) {
  test(`lookup failure is closed and private: ${failure}`, async () => {
    const result = await run({ failure });
    assert.deepEqual(result.decision, { enabled: false, reason: "policy_unavailable" });
    assert(!JSON.stringify(result.decision).includes("PRIVATE"));
  });
}
test("provider keeps full history off and applies explicit reception opt-in", () => {
  const source = readFileSync("src/worker/baileys-provider.ts", "utf8");
  assert(source.includes("resolveApprovedPendingReception(prisma, accountId, Boolean(state.creds.registered))"));
  assert(source.includes("...(pendingReception.enabled ? { logivyaReceivePendingMessages: true } : {})"));
  assert(source.includes("shouldSyncHistoryMessage: () => false"));
  assert(source.includes("const syncContactHistory = false"));
  const policy = readFileSync("src/server/whatsapp-ingestion/pending-delivery-policy.ts", "utf8");
  assert(!policy.includes("cmrt9rhjx001904jinguoxbwq"), "Policy must not hard-code one customer's account");
});
test("normal install and both worker Docker builds contain all protocol patches", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const patch of ["patch-baileys-pending-ingestion.mjs", "patch-baileys-ingestion-ack.mjs"]) {
    assert(pkg.scripts.postinstall.includes(patch));
    assert(pkg.scripts.postinstall.indexOf("patch-baileys-disable-offline-batch.mjs") < pkg.scripts.postinstall.indexOf(patch));
    for (const dockerfile of ["Dockerfile.worker", "ops/vps/Dockerfile.worker"]) {
      assert(readFileSync(dockerfile, "utf8").includes(`COPY scripts/${patch} ./scripts/${patch}`), dockerfile);
    }
    assert(readFileSync("ops/vps/Dockerfile.worker", "utf8").includes(`node scripts/${patch}`));
  }
});
