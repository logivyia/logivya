/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Session files may only be manipulated through this module.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { AccountStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import {
  decryptSensitiveField,
  encryptSensitiveField,
  parseEncryptedField,
  serializeEncryptedField,
  type EncryptionKeyring,
} from "@/server/security/encryption";

const configuredSessionRoot =
  process.env.WHATSAPP_SESSION_DIR ||
  process.env.WHATSAPP_SESSION_ROOT ||
  (process.env.WHATSAPP_SESSION_VOLUME_PERSISTENT === "true" ? "/sessions" : path.join(process.cwd(), "sessions"));

const sessionRoot = path.resolve(configuredSessionRoot);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function boundedIntegerEnvironmentValue(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

const SNAPSHOT_DEBOUNCE_MS = boundedIntegerEnvironmentValue("WHATSAPP_SESSION_SNAPSHOT_DEBOUNCE_MS", 15_000, 1_000, 300_000);
const SNAPSHOT_MIN_INTERVAL_MS = boundedIntegerEnvironmentValue("WHATSAPP_SESSION_SNAPSHOT_MIN_INTERVAL_MS", 3_600_000, 60_000, 86_400_000);
const SNAPSHOT_FAILURE_RETRY_MS = boundedIntegerEnvironmentValue("WHATSAPP_SESSION_SNAPSHOT_FAILURE_RETRY_MS", 300_000, 30_000, 3_600_000);
const SNAPSHOT_MAX_CONCURRENCY = boundedIntegerEnvironmentValue("WHATSAPP_SESSION_SNAPSHOT_CONCURRENCY", 2, 1, 4);
const SNAPSHOT_MAX_FILE_COUNT = boundedIntegerEnvironmentValue("WHATSAPP_SESSION_SNAPSHOT_MAX_FILE_COUNT", 5_000, 100, 25_000);
const SNAPSHOT_MAX_UNCOMPRESSED_BYTES = boundedIntegerEnvironmentValue("WHATSAPP_SESSION_SNAPSHOT_MAX_UNCOMPRESSED_BYTES", 32 * 1024 * 1024, 1024 * 1024, 128 * 1024 * 1024);

export function getWhatsAppSessionRoot() {
  return sessionRoot;
}

export function whatsappSessionDirectory(accountId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(accountId)) throw new Error("INVALID_SESSION_ID");
  const directory = path.resolve(sessionRoot, accountId);
  const relative = path.relative(sessionRoot, directory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("INVALID_SESSION_PATH");
  return directory;
}

export async function ensureWhatsAppSessionRoot() {
  await mkdir(sessionRoot, { recursive: true });
  await access(sessionRoot);
}

export async function hasWhatsAppCredentials(accountId: string) {
  try {
    const value = JSON.parse(await readFile(path.join(whatsappSessionDirectory(accountId), "creds.json"), "utf8")) as { registered?: unknown };
    return value.registered === true;
  } catch {
    return false;
  }
}

function sessionKeyring(): EncryptionKeyring {
  const activeVersion = process.env.FIELD_ENCRYPTION_ACTIVE_VERSION || "v1";
  const configured = process.env[`FIELD_ENCRYPTION_KEY_${activeVersion.toUpperCase()}`];
  const fallback = process.env.WHATSAPP_SESSION_SECRET || process.env.SESSION_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!configured && !fallback) throw new Error("WHATSAPP_SESSION_ENCRYPTION_NOT_CONFIGURED");
  const key = configured ? Buffer.from(configured, "base64url") : createHash("sha256").update(fallback || "").digest();
  if (key.length !== 32) throw new Error("WHATSAPP_SESSION_ENCRYPTION_NOT_CONFIGURED");
  return { activeVersion, keys: { [activeVersion]: key } };
}

type SessionSnapshot = {
  version: 1;
  files: Array<{ relativePath: string; data: string }>;
};

type CompressedSessionSnapshot = {
  version: 2;
  encoding: "gzip-base64";
  uncompressedBytes: number;
  data: string;
};

type SnapshotRuntimeState = {
  hydrated: boolean;
  hydrationPromise?: Promise<void>;
  inFlight?: Promise<boolean>;
  timer?: ReturnType<typeof setTimeout>;
  pendingReason?: string;
  lastAttemptAt: number;
  lastPersistedAt: number;
  lastDigest?: string;
};

const snapshotRuntimeStates = new Map<string, SnapshotRuntimeState>();
const snapshotConcurrencyWaiters: Array<() => void> = [];
let activeSnapshotBackups = 0;

async function withSnapshotConcurrency<T>(operation: () => Promise<T>) {
  if (activeSnapshotBackups >= SNAPSHOT_MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => snapshotConcurrencyWaiters.push(resolve));
  }
  activeSnapshotBackups += 1;
  try {
    return await operation();
  } finally {
    activeSnapshotBackups = Math.max(0, activeSnapshotBackups - 1);
    snapshotConcurrencyWaiters.shift()?.();
  }
}

function snapshotRuntimeState(accountId: string) {
  const existing = snapshotRuntimeStates.get(accountId);
  if (existing) return existing;
  const created: SnapshotRuntimeState = { hydrated: false, lastAttemptAt: 0, lastPersistedAt: 0 };
  snapshotRuntimeStates.set(accountId, created);
  return created;
}

function mergeSnapshotReasons(current: string | undefined, next: string) {
  if (!current || current === next) return next;
  return `${current},${next}`.slice(0, 180);
}

function isHighFrequencySnapshotReason(reason: string) {
  return /^(creds\.update|connection\.open|group\.sync|message\.(sent|deleted)|contact\.lid_mapping\.)/.test(reason);
}

async function listSessionFiles(directory: string, current = directory): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) return listSessionFiles(directory, fullPath);
    if (!entry.isFile()) return [];
    return [path.relative(directory, fullPath).replaceAll("\\", "/")];
  }));
  return files.flat();
}

async function readSessionSnapshotFiles(directory: string, relativeFiles: string[]) {
  const files: SessionSnapshot["files"] = [];
  let serializedPayloadBytes = 0;

  for (const relativePath of relativeFiles) {
    const safeRelativePath = assertSafeRelativeSessionPath(relativePath);
    const data = (await readFile(path.join(directory, safeRelativePath))).toString("base64");
    serializedPayloadBytes += Buffer.byteLength(safeRelativePath) + Buffer.byteLength(data);
    if (serializedPayloadBytes > SNAPSHOT_MAX_UNCOMPRESSED_BYTES) {
      throw new Error("WHATSAPP_SESSION_SNAPSHOT_TOO_LARGE");
    }
    files.push({ relativePath: safeRelativePath, data });
  }

  return files;
}

async function encodeStoredSnapshot(snapshot: SessionSnapshot) {
  const uncompressed = Buffer.from(JSON.stringify(snapshot));
  if (uncompressed.byteLength > SNAPSHOT_MAX_UNCOMPRESSED_BYTES) throw new Error("WHATSAPP_SESSION_SNAPSHOT_TOO_LARGE");
  const compressed = await gzipAsync(uncompressed, { level: 6 });
  const stored: CompressedSessionSnapshot = {
    version: 2,
    encoding: "gzip-base64",
    uncompressedBytes: uncompressed.byteLength,
    data: compressed.toString("base64"),
  };
  return {
    digest: createHash("sha256").update(uncompressed).digest("hex"),
    serialized: JSON.stringify(stored),
    uncompressedBytes: uncompressed.byteLength,
    compressedBytes: compressed.byteLength,
  };
}

async function decodeStoredSnapshot(value: string): Promise<SessionSnapshot> {
  const stored = JSON.parse(value) as SessionSnapshot | CompressedSessionSnapshot;
  if (stored.version === 1) return stored;
  if (stored.version !== 2 || stored.encoding !== "gzip-base64" || typeof stored.data !== "string") {
    throw new Error("INVALID_WHATSAPP_SESSION_SNAPSHOT");
  }
  if (!Number.isSafeInteger(stored.uncompressedBytes) || stored.uncompressedBytes <= 0 || stored.uncompressedBytes > SNAPSHOT_MAX_UNCOMPRESSED_BYTES) {
    throw new Error("INVALID_WHATSAPP_SESSION_SNAPSHOT_SIZE");
  }
  const uncompressed = await gunzipAsync(Buffer.from(stored.data, "base64"));
  if (uncompressed.byteLength !== stored.uncompressedBytes || uncompressed.byteLength > SNAPSHOT_MAX_UNCOMPRESSED_BYTES) {
    throw new Error("INVALID_WHATSAPP_SESSION_SNAPSHOT_SIZE");
  }
  const snapshot = JSON.parse(uncompressed.toString("utf8")) as SessionSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.files)) throw new Error("INVALID_WHATSAPP_SESSION_SNAPSHOT");
  return snapshot;
}

function assertSafeRelativeSessionPath(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) throw new Error("INVALID_SESSION_FILE_PATH");
  return normalized;
}

function snapshotHasRegisteredCredentials(snapshot: SessionSnapshot) {
  const creds = snapshot.files.find((file) => file.relativePath === "creds.json");
  if (!creds) return false;
  try {
    const value = JSON.parse(Buffer.from(creds.data, "base64").toString("utf8")) as { registered?: unknown };
    return value.registered === true;
  } catch {
    return false;
  }
}

async function clearStaleSessionSnapshotMetadata(accountId: string, reason: string) {
  await prisma.whatsAppAccount.updateMany({
    where: {
      id: accountId,
      archivedAt: null,
      OR: [{ sessionSnapshotAt: { not: null } }, { sessionRestoredAt: { not: null } }],
    },
    data: { sessionSnapshotAt: null, sessionRestoredAt: null },
  }).catch((error) => logger.warn("session.snapshot.stale_metadata_clear_failed", {
    accountId,
    reason,
    message: error instanceof Error ? error.message : String(error),
  }));
  logger.warn("WA_SESSION_SNAPSHOT_STALE_METADATA_CLEARED", { accountId, reason });
}

async function hydrateSnapshotRuntimeState(accountId: string, state: SnapshotRuntimeState) {
  if (state.hydrated) return;
  if (!state.hydrationPromise) {
    state.hydrationPromise = prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { sessionSnapshotAt: true },
    }).then((account) => {
      state.lastPersistedAt = Math.max(state.lastPersistedAt, account?.sessionSnapshotAt?.getTime() ?? 0);
      state.hydrated = true;
    }).finally(() => {
      state.hydrationPromise = undefined;
    });
  }
  await state.hydrationPromise;
}

async function performWhatsAppSessionBackup(accountId: string, reason: string) {
  const startedAt = Date.now();
  const state = snapshotRuntimeState(accountId);
  state.lastAttemptAt = startedAt;
  logger.info("WA_SESSION_SNAPSHOT_SAVE_START", { accountId, reason });
  try {
    const directory = whatsappSessionDirectory(accountId);
    const relativeFiles = (await listSessionFiles(directory)).sort();
    if (!relativeFiles.includes("creds.json")) {
      logger.warn("WA_SESSION_SNAPSHOT_SAVE_SKIPPED", { accountId, reason, cause: "creds_json_missing", durationMs: Date.now() - startedAt });
      return false;
    }
    if (relativeFiles.length > SNAPSHOT_MAX_FILE_COUNT) throw new Error("WHATSAPP_SESSION_SNAPSHOT_FILE_LIMIT_EXCEEDED");

    const files = await readSessionSnapshotFiles(directory, relativeFiles);
    const snapshot: SessionSnapshot = { version: 1, files };
    const registered = snapshotHasRegisteredCredentials(snapshot);
    if (!registered) {
      await prisma.whatsAppSession.upsert({
        where: { accountId },
        update: {
          sessionDataEncrypted: null,
          status: AccountStatus.PENDING_PAIRING,
          qrCode: null,
          expiresAt: null,
          lastHeartbeatAt: new Date(),
          snapshotReason: reason,
        },
        create: {
          accountId,
          sessionDataEncrypted: null,
          status: AccountStatus.PENDING_PAIRING,
          lastHeartbeatAt: new Date(),
          snapshotReason: reason,
        },
      });
      await clearStaleSessionSnapshotMetadata(accountId, "snapshot_not_registered");
      logger.warn("WA_SESSION_SNAPSHOT_SAVE_SKIPPED", { accountId, reason, cause: "credentials_not_registered", fileCount: files.length, durationMs: Date.now() - startedAt });
      return false;
    }
    const encoded = await encodeStoredSnapshot(snapshot);
    if (state.lastDigest === encoded.digest) {
      state.lastPersistedAt = Date.now();
      logger.info("WA_SESSION_SNAPSHOT_SAVE_SKIPPED", {
        accountId,
        reason,
        cause: "content_unchanged",
        fileCount: files.length,
        durationMs: Date.now() - startedAt,
      });
      return true;
    }
    const sessionDataEncrypted = serializeEncryptedField(encryptSensitiveField(encoded.serialized, sessionKeyring()));

    await prisma.whatsAppSession.upsert({
      where: { accountId },
      update: {
        sessionDataEncrypted,
        status: registered ? AccountStatus.CONNECTED : AccountStatus.PENDING_PAIRING,
        qrCode: null,
        expiresAt: null,
        lastHeartbeatAt: new Date(),
        snapshotReason: reason,
      },
      create: {
        accountId,
        sessionDataEncrypted,
        status: registered ? AccountStatus.CONNECTED : AccountStatus.PENDING_PAIRING,
        lastHeartbeatAt: new Date(),
        snapshotReason: reason,
      },
    });
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { sessionSnapshotAt: new Date() },
    });
    state.lastDigest = encoded.digest;
    state.lastPersistedAt = Date.now();
    logger.info("session.snapshot.saved", { accountId, reason });
    logger.info("WA_SESSION_SNAPSHOT_SAVE_SUCCESS", {
      accountId,
      reason,
      registered,
      fileCount: files.length,
      uncompressedBytes: encoded.uncompressedBytes,
      compressedBytes: encoded.compressedBytes,
      durationMs: Date.now() - startedAt,
    });
    return true;
  } catch (error) {
    logger.error("session.snapshot.failed", error, { accountId, reason });
    logger.error("WA_SESSION_SNAPSHOT_SAVE_FAILED", error, { accountId, reason, durationMs: Date.now() - startedAt });
    logger.warn("WA_SESSION_SNAPSHOT_FAILURE_ISOLATED", {
      accountId,
      reason,
      retryAfterMs: SNAPSHOT_FAILURE_RETRY_MS,
    });
    return false;
  }
}

async function runSerializedSnapshot(accountId: string, reason: string) {
  const state = snapshotRuntimeState(accountId);
  if (state.inFlight) {
    state.pendingReason = mergeSnapshotReasons(state.pendingReason, reason);
    logger.info("WA_SESSION_SNAPSHOT_SAVE_COALESCED", { accountId, reason });
    return true;
  }
  const inFlight = withSnapshotConcurrency(() => performWhatsAppSessionBackup(accountId, reason));
  state.inFlight = inFlight;
  try {
    return await inFlight;
  } finally {
    state.inFlight = undefined;
    if (state.pendingReason) scheduleDeferredSnapshot(accountId, state.pendingReason);
  }
}

function scheduleDeferredSnapshot(accountId: string, reason: string) {
  const state = snapshotRuntimeState(accountId);
  state.pendingReason = mergeSnapshotReasons(state.pendingReason, reason);
  if (state.inFlight || state.timer) return;
  const timer = setTimeout(() => {
    state.timer = undefined;
    void (async () => {
      try {
        await hydrateSnapshotRuntimeState(accountId, state);
      } catch (error) {
        state.lastAttemptAt = Date.now();
        logger.error("WA_SESSION_SNAPSHOT_THROTTLE_HYDRATION_FAILED", error, { accountId });
      }
      const earliestAfterSuccess = state.lastPersistedAt + SNAPSHOT_MIN_INTERVAL_MS;
      const earliestAfterFailure = state.lastAttemptAt > state.lastPersistedAt ? state.lastAttemptAt + SNAPSHOT_FAILURE_RETRY_MS : 0;
      const remainingMs = Math.max(earliestAfterSuccess, earliestAfterFailure) - Date.now();
      if (remainingMs > 0) {
        state.timer = setTimeout(() => {
          state.timer = undefined;
          const pendingReason = state.pendingReason;
          state.pendingReason = undefined;
          if (pendingReason) void runSerializedSnapshot(accountId, pendingReason).catch((error) => logger.error("WA_SESSION_SNAPSHOT_DEFERRED_FAILED", error, { accountId }));
        }, remainingMs);
        state.timer.unref?.();
        return;
      }
      const pendingReason = state.pendingReason;
      state.pendingReason = undefined;
      if (pendingReason) await runSerializedSnapshot(accountId, pendingReason);
    })().catch((error) => logger.error("WA_SESSION_SNAPSHOT_DEFERRED_FAILED", error, { accountId }));
  }, SNAPSHOT_DEBOUNCE_MS);
  timer.unref?.();
  state.timer = timer;
  logger.info("WA_SESSION_SNAPSHOT_SAVE_DEFERRED", {
    accountId,
    reason,
    debounceMs: SNAPSHOT_DEBOUNCE_MS,
    minimumIntervalMs: SNAPSHOT_MIN_INTERVAL_MS,
  });
}

export async function backupWhatsAppSessionToDatabase(accountId: string, reason = "snapshot") {
  if (isHighFrequencySnapshotReason(reason)) {
    scheduleDeferredSnapshot(accountId, reason);
    return true;
  }
  const state = snapshotRuntimeState(accountId);
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
  const combinedReason = mergeSnapshotReasons(state.pendingReason, reason);
  state.pendingReason = undefined;
  return runSerializedSnapshot(accountId, combinedReason);
}

export async function restoreWhatsAppSessionFromDatabase(accountId: string) {
  const startedAt = Date.now();
  logger.info("WA_RESTORE_START", { accountId, source: "database_snapshot" });
  if (await hasWhatsAppCredentials(accountId)) {
    logger.info("WA_RESTORE_SUCCESS", { accountId, source: "local_filesystem", durationMs: Date.now() - startedAt });
    return true;
  }
  const session = await prisma.whatsAppSession.findFirst({
    where: { accountId, sessionDataEncrypted: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!session?.sessionDataEncrypted) {
    logger.warn("WA_RESTORE_FAILED", { accountId, reason: "snapshot_missing", durationMs: Date.now() - startedAt });
    await clearStaleSessionSnapshotMetadata(accountId, "restore_snapshot_missing");
    return false;
  }

  const snapshot = await decodeStoredSnapshot(decryptSensitiveField(parseEncryptedField(session.sessionDataEncrypted), sessionKeyring()));
  if (!snapshotHasRegisteredCredentials(snapshot)) {
    logger.warn("WA_RESTORE_FAILED", { accountId, reason: "snapshot_not_registered", durationMs: Date.now() - startedAt });
    await clearStaleSessionSnapshotMetadata(accountId, "restore_snapshot_not_registered");
    return false;
  }

  const directory = whatsappSessionDirectory(accountId);
  await mkdir(directory, { recursive: true });
  for (const file of snapshot.files) {
    const relativePath = assertSafeRelativeSessionPath(file.relativePath);
    const destination = path.resolve(directory, relativePath);
    const relativeToRoot = path.relative(directory, destination);
    if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) throw new Error("INVALID_SESSION_RESTORE_PATH");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(file.data, "base64"));
  }
  const restored = await hasWhatsAppCredentials(accountId);
  if (restored) {
    await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { restoreCount: { increment: 1 } } });
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { sessionRestoredAt: new Date(), recoveryLevel: 3 },
    });
    logger.info("session.restore.db.success", { accountId });
    logger.info("WA_RESTORE_SUCCESS", { accountId, source: "database_snapshot", durationMs: Date.now() - startedAt });
  } else {
    logger.warn("WA_RESTORE_FAILED", { accountId, reason: "restored_credentials_not_registered", durationMs: Date.now() - startedAt });
  }
  return restored;
}

export async function hasRestorableWhatsAppCredentials(accountId: string) {
  if (await hasWhatsAppCredentials(accountId)) return true;
  const sessions = await prisma.whatsAppSession.findMany({
    where: { accountId, sessionDataEncrypted: { not: null } },
    select: { sessionDataEncrypted: true },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });
  if (!sessions.length) await clearStaleSessionSnapshotMetadata(accountId, "restorable_check_snapshot_missing");
  for (const session of sessions) {
    if (!session.sessionDataEncrypted) continue;
    try {
      const snapshot = await decodeStoredSnapshot(decryptSensitiveField(parseEncryptedField(session.sessionDataEncrypted), sessionKeyring()));
      if (snapshot.version === 1 && Array.isArray(snapshot.files) && snapshotHasRegisteredCredentials(snapshot)) return true;
    } catch (error) {
      logger.warn("session.snapshot.restorable_check_failed", { accountId, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return false;
}

export async function clearWhatsAppSession(accountId: string) {
  const runtimeState = snapshotRuntimeStates.get(accountId);
  if (runtimeState?.timer) clearTimeout(runtimeState.timer);
  snapshotRuntimeStates.delete(accountId);
  await rm(whatsappSessionDirectory(accountId), { recursive: true, force: true });
  await prisma.whatsAppSession.deleteMany({ where: { accountId } });
  await prisma.whatsAppAccount.updateMany({
    where: { id: accountId, archivedAt: null },
    data: {
      sessionSnapshotAt: null,
      sessionRestoredAt: null,
      lastHeartbeatAt: null,
      lastPingAt: null,
      lastPongAt: null,
    },
  });
}
