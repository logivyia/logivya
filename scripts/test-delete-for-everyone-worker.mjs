import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Execute the actual job handler without booting the worker, DB, Redis or sockets.
// Extracting its AST keeps this regression tied to production control flow.
const source = readFileSync("src/worker/index.ts", "utf8");
const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
const handlers = ast.statements.filter((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === "processDeleteForEveryoneJob");
assert.equal(handlers.length, 1, "Expected exactly one production delete handler");
const compiled = ts.transpileModule(handlers[0].getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function run({ status = "DELIVERED", targetType = "GROUP", mutate = () => {}, windowOpen = true, claimed = true, deleted = [] } = {}) {
  const ownership = { accountId: "account", companyId: "company", userId: "owner" };
  const key = { id: "message", remoteJid: "target", fromMe: true };
  const recipient = {
    id: "recipient", campaignId: "campaign", accountId: "account", status, targetType,
    recipientExternalId: "target", sentAt: new Date(), messageKeyJson: JSON.stringify([key]),
    deleteForEveryoneStatus: "PENDING",
    campaign: { companyId: "company", createdById: "owner" },
    account: { id: "account", ...ownership, archivedAt: null },
    group: targetType === "GROUP" ? { ...ownership } : null,
    contact: targetType === "CONTACT" ? { ...ownership } : null,
  };
  const data = {
    companyId: "company", userId: "owner", campaignId: "campaign", recipientId: "recipient",
    whatsappAccountId: "account", targetType, targetJid: "target", correlationId: "test",
  };
  mutate(recipient, data);
  const calls = [];
  let aggregates = 0;
  const bindings = {
    prisma: { messageRecipient: {
      findUnique: async () => recipient,
      update: async ({ data: update }) => Object.assign(recipient, update),
      updateMany: async ({ where, data: update }) => {
        assert.equal(where.id, recipient.id);
        assert.deepEqual(where.deleteForEveryoneStatus.in, ["PENDING", "FAILED"]);
        if (claimed) Object.assign(recipient, update);
        return { count: claimed ? 1 : 0 };
      },
    } },
    workerId: "test-worker", logger: { info() {}, warn() {}, error() {} },
    updateCampaignDeleteAggregate: async (id) => { assert.equal(id, "campaign"); aggregates++; },
    isDeleteWindowOpen: () => windowOpen,
    parseStoredMessageKeys: (json) => JSON.parse(json),
    parseStoredDeletedMessageKeyIds: () => new Set(deleted),
    serializeStoredMessageKeys: (keys, ids) => JSON.stringify({ keys, deleted: [...ids] }),
    withWhatsAppAccountLock: async (id, operation, fn) => {
      assert.equal(id, "account"); assert.equal(operation, "message-delete-for-everyone");
      return fn();
    },
    provider: {
      deleteGroupMessage: async (input) => { calls.push({ type: "GROUP", input }); },
      deleteContactMessage: async (input) => { calls.push({ type: "CONTACT", input }); },
    },
    isRecoverableWhatsAppSendError: () => false,
  };
  const handler = new Function(...Object.keys(bindings), `${compiled}\nreturn processDeleteForEveryoneJob;`)(...Object.values(bindings));
  await handler({ id: "job", data, opts: { attempts: 1 }, attemptsMade: 0 });
  return { recipient, calls, aggregates, key };
}

for (const status of ["SENT", "DELIVERED"]) {
  for (const targetType of ["GROUP", "CONTACT"]) {
    test(`${status} ${targetType} is revoked with the stored key`, async () => {
      const result = await run({ status, targetType });
      assert.equal(result.recipient.deleteForEveryoneStatus, "DELETED");
      assert.equal(result.recipient.deleteForEveryoneError, null);
      assert.equal(result.calls.length, 1);
      assert.equal(result.calls[0].type, targetType);
      assert.deepEqual(result.calls[0].input.messageKey, result.key);
      assert.equal(result.aggregates, 1);
    });
  }
}
for (const status of ["PENDING", "FAILED", "CANCELED", "PROCESSING"]) {
  test(`${status} is never sent to the revoke provider`, async () => {
    const result = await run({ status });
    assert.equal(result.recipient.deleteForEveryoneError, "MESSAGE_NOT_SENT");
    assert.equal(result.calls.length, 0);
  });
}
for (const targetType of ["GROUP", "CONTACT"]) {
  test(`${targetType} rejects foreign target ownership even when DELIVERED`, async () => {
    const result = await run({ targetType, mutate: (r) => { r[targetType.toLowerCase()].userId = "other-owner"; } });
    assert.equal(result.recipient.deleteForEveryoneError, "MESSAGE_DELETE_TENANT_MISMATCH");
    assert.equal(result.calls.length, 0);
  });
}
test("rejects foreign account ownership", async () => {
  const result = await run({ mutate: (r) => { r.account.userId = "other-owner"; } });
  assert.equal(result.recipient.deleteForEveryoneError, "MESSAGE_DELETE_TENANT_MISMATCH");
  assert.equal(result.calls.length, 0);
});
test("rejects a mismatched target JID", async () => {
  const result = await run({ mutate: (_r, data) => { data.targetJid = "other-target"; } });
  assert.equal(result.recipient.deleteForEveryoneError, "MESSAGE_DELETE_TENANT_MISMATCH");
  assert.equal(result.calls.length, 0);
});
test("preserves the expiry gate", async () => {
  const result = await run({ windowOpen: false });
  assert.equal(result.recipient.deleteForEveryoneStatus, "EXPIRED");
  assert.equal(result.calls.length, 0);
});
test("rejects missing stored keys", async () => {
  const result = await run({ mutate: (r) => { r.messageKeyJson = "[]"; } });
  assert.equal(result.recipient.deleteForEveryoneError, "WHATSAPP_MESSAGE_KEY_MISSING");
  assert.equal(result.calls.length, 0);
});
test("does not resend an already deleted key", async () => {
  const result = await run({ deleted: ["message"] });
  assert.equal(result.recipient.deleteForEveryoneStatus, "DELETED");
  assert.equal(result.calls.length, 0);
});
test("does not revoke without claiming the job", async () => {
  const result = await run({ claimed: false });
  assert.equal(result.calls.length, 0);
});
