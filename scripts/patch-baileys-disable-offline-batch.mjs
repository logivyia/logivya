import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve("node_modules/@whiskeysockets/baileys/lib/Socket/socket.js");
const marker = "LOGIVYA_OFFLINE_BATCH_DISABLED";
const source = await readFile(target, "utf8");

if (source.includes(marker)) {
  process.stdout.write("Baileys offline batch patch already applied.\n");
  process.exit(0);
}

const original = `    ws.on('CB:ib,,offline_preview', (node) => {
        logger.info('offline preview received', JSON.stringify(node));
        sendNode({
            tag: 'ib',
            attrs: {},
            content: [{ tag: 'offline_batch', attrs: { count: '100' } }]
        });
    });`;
const replacement = `    // ${marker}: Logivya is an outbound delivery worker. Requesting the
    // encrypted offline history on every reconnect can create an unbounded decrypt/retry
    // loop for restored multi-device sessions. Live messages and delivery receipts remain enabled.
    ws.on('CB:ib,,offline_preview', (node) => {
        logger.info({ attrs: node.attrs }, 'offline preview ignored by Logivya outbound worker');
    });`;

if (!source.includes(original)) {
  throw new Error(`Expected Baileys offline_preview handler was not found in ${target}`);
}

await writeFile(target, source.replace(original, replacement), "utf8");
process.stdout.write("Baileys offline batch patch applied.\n");
