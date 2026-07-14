import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function applyRequiredPatch(relativePath, marker, replacements) {
  const file = path.join(root, relativePath);
  let source = readFileSync(file, "utf8");
  if (source.includes(marker)) return;

  let applied = 0;
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`Unsupported Baileys source while applying ${marker} to ${relativePath}`);
    }
    source = source.replace(before, after);
    applied += 1;
  }
  if (applied !== replacements.length || !source.includes(marker)) {
    throw new Error(`Incomplete Baileys compatibility patch ${marker} for ${relativePath}`);
  }
  writeFileSync(file, source, "utf8");
}

applyRequiredPatch(
  "node_modules/@whiskeysockets/baileys/lib/Utils/chat-utils.js",
  "LOGIVYA_CONTACT_PN_JID_COMPAT",
  [[
    "                jid: isJidUser(id) ? id : undefined\n",
    "                // LOGIVYA_CONTACT_PN_JID_COMPAT: preserve the PN carried by modern LID contact actions.\n" +
      "                jid: isJidUser(id)\n" +
      "                    ? id\n" +
      "                    : action.contactAction.pnJid && isJidUser(action.contactAction.pnJid)\n" +
      "                        ? action.contactAction.pnJid\n" +
      "                        : undefined\n",
  ]],
);

applyRequiredPatch(
  "node_modules/@whiskeysockets/baileys/lib/Utils/chat-utils.js",
  "LOGIVYA_LID_MAPPING_EVENT_COMPAT",
  [[
    "        ]);\n    }\n    else if (action?.pushNameSetting) {\n",
    "        ]);\n" +
      "        if (action.contactAction.lidJid && isJidUser(id)) {\n" +
      "            ev.emit('lid-mapping.update', { lid: action.contactAction.lidJid, pn: id });\n" +
      "        }\n" +
      "    }\n" +
      "    else if (action?.pnForLidChatAction) {\n" +
      "        // LOGIVYA_LID_MAPPING_EVENT_COMPAT: expose modern app-state LID/PN aliases.\n" +
      "        if (id && action.pnForLidChatAction.pnJid) {\n" +
      "            ev.emit('lid-mapping.update', { lid: id, pn: action.pnForLidChatAction.pnJid });\n" +
      "        }\n" +
      "    }\n" +
      "    else if (action?.pushNameSetting) {\n",
  ]],
);

applyRequiredPatch(
  "node_modules/@whiskeysockets/baileys/lib/Utils/history.js",
  "LOGIVYA_HISTORY_LID_PN_COMPAT",
  [[
    "    const chats = [];\n    switch (item.syncType) {\n",
    "    const chats = [];\n" +
      "    // LOGIVYA_HISTORY_LID_PN_COMPAT: recover phone JIDs for LID-based history conversations.\n" +
      "    const phoneJidByLid = new Map();\n" +
      "    for (const mapping of item.phoneNumberToLidMappings || []) {\n" +
      "        if (mapping.lidJid && mapping.pnJid) phoneJidByLid.set(mapping.lidJid, mapping.pnJid);\n" +
      "    }\n" +
      "    switch (item.syncType) {\n",
  ], [
    "                    lid: chat.lidJid || undefined,\n                    jid: isJidUser(chat.id) ? chat.id : undefined\n",
    "                    lid: chat.lidJid || (chat.id?.endsWith('@lid') ? chat.id : undefined),\n" +
      "                    jid: isJidUser(chat.id)\n" +
      "                        ? chat.id\n" +
      "                        : phoneJidByLid.get(chat.lidJid || chat.id) || undefined\n",
  ]],
);

applyRequiredPatch(
  "node_modules/@whiskeysockets/baileys/lib/Utils/history.js",
  "LOGIVYA_HISTORY_LID_MAPPING_EXPORT",
  [[
    "        progress: item.progress\n",
    "        progress: item.progress,\n" +
      "        // LOGIVYA_HISTORY_LID_MAPPING_EXPORT: let the worker persist every history alias.\n" +
      "        lidPnMappings: [...phoneJidByLid].map(([lid, pn]) => ({ lid, pn }))\n",
  ]],
);

applyRequiredPatch(
  "node_modules/@whiskeysockets/baileys/lib/Utils/process-message.js",
  "LOGIVYA_LID_MIGRATION_MAPPING_SYNC_COMPAT",
  [[
    "            case proto.Message.ProtocolMessage.Type.MESSAGE_EDIT:\n",
    "            case proto.Message.ProtocolMessage.Type.LID_MIGRATION_MAPPING_SYNC:\n" +
      "                // LOGIVYA_LID_MIGRATION_MAPPING_SYNC_COMPAT: backport the official Baileys LID mapping decoder.\n" +
      "                const encodedMappingPayload = protocolMsg.lidMigrationMappingSyncMessage?.encodedMappingPayload;\n" +
      "                if (encodedMappingPayload?.length) {\n" +
      "                    const { pnToLidMappings = [] } = proto.LIDMigrationMappingSyncPayload.decode(encodedMappingPayload);\n" +
      "                    const mappings = [];\n" +
      "                    for (const { pn, latestLid, assignedLid } of pnToLidMappings) {\n" +
      "                        const lid = latestLid || assignedLid;\n" +
      "                        if (pn && lid) mappings.push({ lid: `${lid}@lid`, pn: `${pn}@s.whatsapp.net` });\n" +
      "                    }\n" +
      "                    if (mappings.length) ev.emit('lid-mapping.update', { mappings });\n" +
      "                }\n" +
      "                break;\n" +
      "            case proto.Message.ProtocolMessage.Type.MESSAGE_EDIT:\n",
  ]],
);

console.log("Baileys contact PN/LID compatibility and persistent mapping patches are active.");
