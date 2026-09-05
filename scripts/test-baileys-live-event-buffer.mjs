import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { proto, WAMessageStubType } from "@whiskeysockets/baileys";
import ts from "typescript";

// Load the main package first to respect Baileys' circular import initialization.
const { makeEventBuffer } = await import("@whiskeysockets/baileys/lib/Utils/event-buffer.js");
const { SyncState } = await import("@whiskeysockets/baileys/lib/Types/State.js");
const source = readFileSync("node_modules/@whiskeysockets/baileys/lib/Socket/chats.js", "utf8");
const ast = ts.createSourceFile("chats.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const upserts = [], connections = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "upsertMessage") upserts.push(node.initializer);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "ev.on"
    && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "connection.update") connections.push(node.arguments[1]);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(upserts.length, 1);
assert.equal(connections.length, 1);
function harness({ history = false, initialState = SyncState.Connecting, restored = false, processMessage } = {}) {
  const logger = { info() {}, debug() {}, trace() {}, warn() {}, error() {} };
  const ev = makeEventBuffer(logger), events = [], timers = [];
  const ws = { isOpen: true };
  ev.process(map => events.push(map));
  if (restored) ev.buffer();
  const bindings = {
    ev, ws, logger, proto, SyncState, initialState,
    fireInitQueries: false, executeInitQueries: async () => {}, onUnexpectedError: assert.fail,
    sendPresenceUpdate: async () => {}, markOnlineOnConnect: false,
    shouldSyncHistoryMessage: () => history,
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimeout: timer => { timer.cancelled = true; },
    authState: { creds: { me: { id: "local@s.whatsapp.net" } }, keys: {} },
    jidNormalizedUser: jid => jid,
    getHistoryMsg: message => message?.history,
    PROCESSABLE_HISTORY_TYPES: [proto.HistorySync.HistorySyncType.RECENT],
    ALL_WA_PATCH_NAMES: [], resyncAppState: async () => {}, placeholderResendCache: {}, config: { options: {} },
    processMessage: processMessage || (async (msg, { ev: emitter }) => {
      if (msg.message?.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE) {
        emitter.emit("messages.update", [{ key: msg.message.protocolMessage.key,
          update: { message: null, messageStubType: WAMessageStubType.REVOKE, key: msg.key } }]);
      }
    }),
  };
  const runtime = new Function(...Object.keys(bindings), `
    let syncState = initialState;
    let awaitingSyncTimeout;
    const upsertMessage = ${upserts[0].getText(ast)};
    const onConnection = ${connections[0].getText(ast)};
    return { upsertMessage, onConnection, state: () => syncState };
  `)(...Object.values(bindings));
  return { ...runtime, ev, ws, events, timers,
    tick: () => { for (const timer of timers.splice(0)) if (!timer.cancelled && timer.ms === 0) timer.fn(); },
    messages: () => events.flatMap(event => event["messages.upsert"]?.messages || []),
  };
}
function message(id = "message-1") {
  return { key: { id, remoteJid: "local-test@g.us", fromMe: true }, messageTimestamp: 1, message: { conversation: "local non-network test" } };
}
for (const restored of [false, true]) {
  test(`history-disabled open becomes Online without offline completion; restored=${restored}`, async () => {
    const h = harness({ restored });
    h.onConnection({ connection: "open" }); h.tick();
    assert.equal(h.state(), SyncState.Online);
    assert.equal(h.ev.isBuffering(), false);
    await h.upsertMessage(message(), "append");
    assert.equal(h.messages().length, 1);
    assert.equal(h.ev.isBuffering(), false);
  });
}
test("every completed online own-message upsert is emitted without another incoming node", async () => {
  const h = harness({ initialState: SyncState.Online });
  for (let n = 0; n < 3; n++) {
    await h.upsertMessage(message(`own-${n}`), "append");
    assert.equal(h.messages().length, n + 1);
  }
});
test("online revoke targets the original message after its earlier upsert was emitted", async () => {
  const h = harness({ initialState: SyncState.Online });
  const original = message();
  await h.upsertMessage(original, "append");
  await h.upsertMessage({ ...message("revoke-envelope"), message: { protocolMessage: {
    type: proto.Message.ProtocolMessage.Type.REVOKE, key: original.key,
  } } }, "append");
  const updates = h.events.flatMap(event => event["messages.update"] || []);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].key.id, original.key.id);
  assert.equal(updates[0].update.messageStubType, WAMessageStubType.REVOKE);
});
test("processing is complete before live events are released", async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const h = harness({ initialState: SyncState.Online, processMessage: async () => wait });
  const work = h.upsertMessage(message(), "append");
  await Promise.resolve(); assert.equal(h.messages().length, 0);
  release(); await work; assert.equal(h.messages().length, 1);
});
test("an online processing error is propagated without stranding the event buffer", async () => {
  const h = harness({ initialState: SyncState.Online, processMessage: async () => { throw new Error("EXPECTED"); } });
  await assert.rejects(h.upsertMessage(message(), "append"), /EXPECTED/);
  assert.equal(h.ev.isBuffering(), false);
});
for (const initialState of [SyncState.Connecting, SyncState.AwaitingInitialSync, SyncState.Syncing]) {
  test(`does not prematurely flush history synchronization state ${SyncState[initialState]}`, async () => {
    const h = harness({ history: true, initialState, restored: true });
    await h.upsertMessage(message(), "notify");
    assert.equal(h.messages().length, 0);
    assert.equal(h.ev.isBuffering(), true);
  });
}
test("history-enabled open still waits for the real pending-notification signal", () => {
  const h = harness({ history: true, restored: true });
  h.onConnection({ connection: "open" }); h.tick();
  assert.equal(h.state(), SyncState.Connecting);
  assert.equal(h.ev.isBuffering(), true);
  h.onConnection({ receivedPendingNotifications: true });
  assert.equal(h.state(), SyncState.AwaitingInitialSync);
  assert.equal(h.timers.some(timer => timer.ms === 20000), true);
});
test("a closing socket does not flush a late upsert", async () => {
  const h = harness({ initialState: SyncState.Online }); h.ws.isOpen = false;
  await h.upsertMessage(message(), "append");
  assert.equal(h.messages().length, 0);
});
test("flushing one socket does not release another socket's messages", async () => {
  const a = harness({ initialState: SyncState.Online });
  const b = harness({ history: true, initialState: SyncState.Syncing });
  await b.upsertMessage(message("other-socket"), "notify");
  await a.upsertMessage(message("owned-socket"), "append");
  assert.equal(a.messages().length, 1); assert.equal(b.messages().length, 0);
});
