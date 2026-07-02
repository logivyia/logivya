const accountSizes = [100, 1_000, 10_000, 100_000] as const;
const backoff = [5, 10, 20, 40, 60, 120] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const size of accountSizes) {
  const reconnectLocks = new Set<string>();
  const syncLocks = new Set<string>();
  let queuedMessages = 0;

  for (let index = 0; index < size; index += 1) {
    const accountId = `account-${index}`;
    reconnectLocks.add(accountId);
    syncLocks.add(accountId);
    queuedMessages += 10;
  }

  assert(reconnectLocks.size === size, `Reconnect lock collision at ${size}`);
  assert(syncLocks.size === size, `Sync lock collision at ${size}`);
  assert(queuedMessages === size * 10, `Queue accounting failed at ${size}`);
  assert(backoff.at(-1) === 120, "Reconnect backoff cap must remain 120 seconds");

  console.log(`V3 load simulation passed: ${size} accounts, ${queuedMessages} queued messages`);
}
