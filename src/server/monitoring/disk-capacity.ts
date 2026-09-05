import { statfs } from "node:fs/promises";

export function evaluateDiskCapacity(blocks: number, availableBlocks: number, blockSize: number) {
  if (![blocks, availableBlocks, blockSize].every(Number.isFinite) || blocks <= 0 || availableBlocks < 0 || availableBlocks > blocks || blockSize <= 0) {
    throw new Error("DISK_CAPACITY_INVALID");
  }
  const availableBytes = availableBlocks * blockSize;
  const availablePercent = availableBlocks / blocks * 100;
  const state = availablePercent <= 5 || availableBytes < 2 * 1024 ** 3 ? "UNAVAILABLE"
    : availablePercent <= 15 || availableBytes < 8 * 1024 ** 3 ? "DEGRADED" : "HEALTHY";
  return { state, availableBytes, totalBytes: blocks * blockSize, availablePercent: Math.round(availablePercent * 10) / 10 } as const;
}

export async function readDiskCapacity() {
  // Reports the filesystem backing this process; it does not infer capacity of an external provider.
  const value = await statfs(process.cwd());
  return evaluateDiskCapacity(value.blocks, value.bavail, value.bsize);
}
