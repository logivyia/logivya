import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { proto, useMultiFileAuthState as loadMultiFileAuthState } from "@whiskeysockets/baileys";

import { processSyncAction } from "../node_modules/@whiskeysockets/baileys/lib/Utils/chat-utils.js";
import { processHistoryMessage } from "../node_modules/@whiskeysockets/baileys/lib/Utils/history.js";

const pn = "905551112233@s.whatsapp.net";
const lid = "123456789012345@lid";
const events = [];
const emitter = {
  emit(event, data) {
    events.push({ event, data });
    return true;
  },
};

processSyncAction({
  syncAction: { value: { contactAction: { fullName: "Test Contact", lidJid: lid } } },
  index: ["contact", pn],
}, emitter);
assert.deepEqual(
  events.find((event) => event.event === "lid-mapping.update")?.data,
  { lid, pn },
  "contactAction must expose its PN/LID alias",
);

events.length = 0;
processSyncAction({
  syncAction: { value: { pnForLidChatAction: { pnJid: pn } } },
  index: ["pnForLidChat", lid],
}, emitter);
assert.deepEqual(
  events.find((event) => event.event === "lid-mapping.update")?.data,
  { lid, pn },
  "pnForLidChatAction must expose its PN/LID alias",
);

const history = processHistoryMessage({
  syncType: proto.HistorySync.HistorySyncType.FULL,
  conversations: [{ id: lid, lidJid: lid, name: "History Contact", messages: [] }],
  phoneNumberToLidMappings: [{ lidJid: lid, pnJid: pn }],
});
assert.equal(history.contacts[0]?.jid, pn, "history contacts must resolve to the phone JID");
assert.deepEqual(history.lidPnMappings, [{ lid, pn }], "history mappings must be exported to the worker");

const directory = await mkdtemp(path.join(os.tmpdir(), "logivya-lid-mapping-"));
try {
  const first = await loadMultiFileAuthState(directory);
  await first.state.keys.set({
    "lid-mapping": {
      "905551112233": "123456789012345",
      "123456789012345_reverse": "905551112233",
    },
  });
  const restored = await loadMultiFileAuthState(directory);
  const reverse = await restored.state.keys.get("lid-mapping", ["123456789012345_reverse"]);
  assert.equal(reverse["123456789012345_reverse"], "905551112233", "reverse LID mapping must survive session restore");
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Baileys PN/LID runtime mapping and session persistence checks passed.");
