import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { WAMessageStubType } from "@whiskeysockets/baileys";
import ts from "typescript";

const source = readFileSync("src/worker/baileys-provider.ts", "utf8");
const ast = ts.createSourceFile("provider.ts", source, ts.ScriptTarget.Latest, true);
const handlers = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "socket.ev.on"
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "messages.update") {
    handlers.push(node.arguments[1]);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(handlers.length, 1);
const compiled = ts.transpileModule(`const handler = ${handlers[0].getText(ast)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function run(updates, current = true, deleteFails = false) {
  const deleted = [], captured = [], acknowledged = [], errors = [];
  const bindings = {
    accountId: "owned-account", socket: {}, generation: 7, WAMessageStubType,
    isCurrentSession: () => current,
    markWhatsAppSourceMessageDeleted: async (input) => {
      deleted.push(input);
      if (deleteFails) throw new Error("TEST_DB_UNAVAILABLE");
    },
    captureApprovedWhatsAppMessage: async (input) => { captured.push(input); },
    whatsappInboundDescriptor: () => ({ messageType: "TEXT", attachments: [] }),
    whatsappInboundText: (message) => message.message?.conversation || "",
    inboundSenderJid: (_accountId, senderJid) => senderJid ?? null,
    inboundSenderDisplayName: () => null,
    acknowledgementFromBaileysStatus: (status) => status === 3 ? "DELIVERED" : null,
    recordOutboundAcknowledgement: (...args) => { acknowledged.push(args); },
    logger: { error: (...args) => { errors.push(args); } },
  };
  const handler = new Function(...Object.keys(bindings), `${compiled}\nreturn handler;`)(...Object.values(bindings));
  handler(updates);
  await Promise.resolve();
  await Promise.resolve();
  return { deleted, captured, acknowledged, errors };
}
function revoke(key = {}) {
  return {
    key: { remoteJid: "approved@g.us", id: "original-message", fromMe: false, ...key },
    // Baileys 6.7.24 process-message.js emits this shape. update.key is the
    // revoke envelope; the top-level key identifies the original message.
    update: { message: null, messageStubType: WAMessageStubType.REVOKE, key: { id: "revoke-envelope" } },
  };
}
for (const fromMe of [false, true]) {
  test(`group revoke fromMe=${fromMe} deactivates its original source`, async () => {
    const result = await run([revoke({ fromMe })]);
    assert.deepEqual(result.deleted, [{ accountId: "owned-account", providerMessageId: "original-message" }]);
    assert.deepEqual(result.captured, []);
    assert.deepEqual(result.acknowledged, []);
  });
}
test("stale socket events cannot change source state", async () => {
  assert.deepEqual((await run([revoke()], false)).deleted, []);
});
test("non-group and missing message identities are ignored", async () => {
  assert.deepEqual((await run([revoke({ remoteJid: "contact@s.whatsapp.net" }), revoke({ id: null })])).deleted, []);
});
test("a null content update alone is not a revoke", async () => {
  const update = revoke(); delete update.update.messageStubType;
  assert.deepEqual((await run([update])).deleted, []);
});
test("delivery acknowledgement handling remains intact", async () => {
  const result = await run([{ key: { id: "sent", fromMe: true, remoteJid: "approved@g.us" }, update: { status: 3 } }]);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.acknowledged.length, 1);
});
test("edited text is captured, not treated as deleted", async () => {
  const result = await run([{ key: { id: "edited", remoteJid: "approved@g.us" }, update: { message: { conversation: "Updated content" } } }]);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.captured.length, 1);
  assert.equal(result.captured[0].edited, true);
});
test("source deletion failure is observed, not unhandled", async () => {
  const result = await run([revoke()], true, true);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0][0], "whatsapp_ingestion.delete_capture_failed");
});
