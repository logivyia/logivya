import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const marker = 'LOGIVYA_APPROVED_PENDING_INGESTION_V1';
export const original = `    ws.on('CB:ib,,offline_preview', (node) => {
        logger.info({ attrs: node.attrs }, 'offline preview ignored by Logivya outbound worker');
    });`;
export const replacement = `    // ${marker}: server pending delivery is distinct from full chat history.
    // Outbound-only accounts keep the no-download policy. Approved ingestion accounts
    // may drain at most three protocol batches; no background retry or unlimited loop.
    let logivyaPendingBatches = 0;
    let logivyaPendingComplete = false;
    ev.on('connection.update', ({ receivedPendingNotifications }) => {
        if (receivedPendingNotifications) logivyaPendingComplete = true;
    });
    ws.on('CB:ib,,offline_preview', () => {
        if (config.logivyaReceivePendingMessages !== true) {
            logger.info('offline preview ignored by Logivya outbound worker');
            return;
        }
        if (!ws.isOpen || logivyaPendingComplete) return;
        if (logivyaPendingBatches >= 3) {
            logger.warn('approved ingestion pending batch limit reached');
            return;
        }
        logivyaPendingBatches += 1;
        logger.info({ batch: logivyaPendingBatches }, 'approved ingestion pending batch requested');
        sendNode({ tag: 'ib', attrs: {}, content: [{ tag: 'offline_batch', attrs: { count: '100' } }] })
            .catch(() => logger.warn('approved ingestion pending batch request failed'));
    });`;

export function patchPendingIngestion(input) {
  const eol = input.includes('\r\n') ? '\r\n' : '\n';
  const source = input.replaceAll('\r\n', '\n');
  if (source.includes(marker)) {
    if (!source.includes(replacement)) throw new Error('Incomplete pending ingestion patch');
    return input;
  }
  if (!source.includes('LOGIVYA_OFFLINE_BATCH_DISABLED') || source.split(original).length !== 2) {
    throw new Error('Unexpected Baileys offline handler; pending ingestion patch refused');
  }
  const patched = source.replace(original, replacement);
  return eol === '\r\n' ? patched.replaceAll('\n', eol) : patched;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = path.resolve(process.argv[2] || 'node_modules/@whiskeysockets/baileys/lib/Socket/socket.js');
  const before = await readFile(target, 'utf8');
  const after = patchPendingIngestion(before);
  if (before !== after) await writeFile(target, after, 'utf8');
  process.stdout.write(before === after ? 'Pending ingestion patch already applied.\n' : 'Pending ingestion patch applied.\n');
}
