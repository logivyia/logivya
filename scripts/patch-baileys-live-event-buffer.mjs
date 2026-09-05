import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const marker = "LOGIVYA_LIVE_EVENT_BUFFER_V1";
const upsertStart = "    const upsertMessage = ev.createBufferedFunction(async (msg, type) => {\n";
const upsertEnd = "\n    });\n    ws.on('CB:presence', handlePresenceUpdate);";
const connectionGuard = "        if (!receivedPendingNotifications || syncState !== SyncState.Connecting) {";
const liveGuard = `        // ${marker}: no offline-history request is made by Logivya.
        // A history-disabled connection must not wait forever for its completion.
        const skipOfflineWait = connection === 'open' && !shouldSyncHistoryMessage(proto.Message.HistorySyncNotification.fromObject({
            syncType: proto.HistorySync.HistorySyncType.RECENT
        }));
        if ((!receivedPendingNotifications && !skipOfflineWait) || syncState !== SyncState.Connecting) {`;
const liveFinally = `        }
        finally {
            // Own sends do not pass through messages-recv's processNodeWithBuffer.
            // Preserve initial/history sync buffering; release only completed live work.
            if (syncState === SyncState.Online && ws.isOpen) {
                ev.flush();
            }
        }`;

export function patchChatsSource(input) {
  const eol = input.includes("\r\n") ? "\r\n" : "\n";
  let source = input.replaceAll("\r\n", "\n");
  if (source.includes(marker)) {
    if (!source.includes(liveGuard) || !source.includes(liveFinally)) throw new Error("Incomplete Baileys live event patch");
    return input;
  }
  for (const anchor of [upsertStart, upsertEnd, connectionGuard]) {
    if (source.split(anchor).length !== 2) throw new Error("Unexpected Baileys chats.js shape; live event patch refused");
  }
  const start = source.indexOf(upsertStart) + upsertStart.length;
  const end = source.indexOf(upsertEnd, start);
  if (end <= start) throw new Error("Unexpected Baileys upsert boundaries");
  const body = source.slice(start, end);
  source = source.slice(0, start) + "        try {\n"
    + body.split("\n").map(line => "    " + line).join("\n") + "\n"
    + liveFinally + source.slice(end);
  source = source.replace(connectionGuard, liveGuard);
  return eol === "\r\n" ? source.replaceAll("\n", eol) : source;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = path.resolve(process.argv[2] || "node_modules/@whiskeysockets/baileys/lib/Socket/chats.js");
  const before = await readFile(target, "utf8");
  const after = patchChatsSource(before);
  if (after !== before) await writeFile(target, after, "utf8");
  process.stdout.write(after === before ? "Baileys live event buffer patch already applied.\n" : "Baileys live event buffer patch applied.\n");
}
