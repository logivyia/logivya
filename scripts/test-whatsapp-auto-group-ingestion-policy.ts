import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  groupIngestionPolicyNeedsUpdate,
  resolveAutoGroupIngestionAccountIds,
  resolveAutoGroupIngestionMinimumConfidence,
  resolveSyncedGroupIngestionPolicy,
  shouldAutoEnableAllSyncedGroups,
} from "../src/server/whatsapp-ingestion/group-sync-policy";

const accountId = "owned-account";
const ownerUserId = "owner-user";
const syncedAt = new Date("2026-09-02T10:00:00.000Z");

test("configured account allowlist is trimmed and exact", () => {
  assert.deepEqual([...resolveAutoGroupIngestionAccountIds(" owned-account, second-account ,, ")], ["owned-account", "second-account"]);
  assert.equal(shouldAutoEnableAllSyncedGroups(accountId, "owned-account"), true);
  assert.equal(shouldAutoEnableAllSyncedGroups(accountId, "owned-account-suffix"), false);
});

test("new groups on an allowed account are approved for high-confidence automatic publication", () => {
  assert.deepEqual(resolveSyncedGroupIngestionPolicy({
    accountId,
    ownerUserId,
    syncedAt,
    configuredAccountIds: accountId,
    configuredConfidence: "90",
  }), {
    ingestionEnabled: true,
    ingestionApprovedAt: syncedAt,
    ingestionApprovedById: ownerUserId,
    autoPublicationEnabled: true,
    manualReviewRequired: false,
    minimumConfidence: 90,
    ingestionPausedAt: null,
  });
});

test("foreign accounts remain unchanged", () => {
  assert.equal(resolveSyncedGroupIngestionPolicy({
    accountId: "foreign-account",
    ownerUserId,
    syncedAt,
    configuredAccountIds: accountId,
  }), undefined);
});

test("existing approval evidence is preserved while a paused source is restored", () => {
  const approvedAt = new Date("2026-08-30T09:00:00.000Z");
  const existing = {
    ingestionEnabled: false,
    ingestionApprovedAt: approvedAt,
    ingestionApprovedById: "original-approver",
    autoPublicationEnabled: false,
    manualReviewRequired: true,
    minimumConfidence: 85,
    ingestionPausedAt: new Date("2026-09-01T09:00:00.000Z"),
  };
  const desired = resolveSyncedGroupIngestionPolicy({ accountId, ownerUserId, syncedAt, existing, configuredAccountIds: accountId });
  assert.equal(desired?.ingestionApprovedAt, approvedAt);
  assert.equal(desired?.ingestionApprovedById, "original-approver");
  assert.equal(desired?.ingestionPausedAt, null);
  assert.equal(groupIngestionPolicyNeedsUpdate(existing, desired), true);
});

test("confidence is bounded and invalid configuration fails to the safe default", () => {
  assert.equal(resolveAutoGroupIngestionMinimumConfidence("invalid"), 90);
  assert.equal(resolveAutoGroupIngestionMinimumConfidence("30"), 85);
  assert.equal(resolveAutoGroupIngestionMinimumConfidence("120"), 100);
});

test("provider applies the policy to both upsert paths and keeps it account scoped", () => {
  const source = readFileSync("src/worker/baileys-provider.ts", "utf8");
  assert(source.includes("resolveSyncedGroupIngestionPolicy({"));
  assert.equal(source.match(/\.\.\.ingestionPolicy,/g)?.length, 2);
  assert(!source.includes("cmrt9rhjx001904jinguoxbwq"), "Source must not hard-code a customer account id");
});
