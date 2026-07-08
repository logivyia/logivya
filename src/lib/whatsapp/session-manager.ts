/**
 * STABLE WHATSAPP/MESSAGE CORE - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL.
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Session files may only be manipulated through this module.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
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

export async function backupWhatsAppSessionToDatabase(accountId: string, reason = "snapshot") {
  const startedAt = Date.now();
  logger.info("WA_SESSION_SNAPSHOT_SAVE_START", { accountId, reason });
  try {
    const directory = whatsappSessionDirectory(accountId);
    const relativeFiles = await listSessionFiles(directory);
    if (!relativeFiles.includes("creds.json")) {
      logger.warn("WA_SESSION_SNAPSHOT_SAVE_SKIPPED", { accountId, reason, cause: "creds_json_missing", durationMs: Date.now() - startedAt });
      return false;
    }

    const files = await Promise.all(relativeFiles.map(async (relativePath) => ({
      relativePath: assertSafeRelativeSessionPath(relativePath),
      data: (await readFile(path.join(directory, relativePath))).toString("base64"),
    })));
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
    const sessionDataEncrypted = serializeEncryptedField(encryptSensitiveField(JSON.stringify(snapshot), sessionKeyring()));

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
    logger.info("session.snapshot.saved", { accountId, reason });
    logger.info("WA_SESSION_SNAPSHOT_SAVE_SUCCESS", {
      accountId,
      reason,
      registered,
      fileCount: files.length,
      durationMs: Date.now() - startedAt,
    });
    return true;
  } catch (error) {
    logger.error("session.snapshot.failed", error, { accountId, reason });
    logger.error("WA_SESSION_SNAPSHOT_SAVE_FAILED", error, { accountId, reason, durationMs: Date.now() - startedAt });
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { lastError: "WHATSAPP_SESSION_SNAPSHOT_FAILED", recoveryLevel: 1, healthScore: 65 },
    }).catch((updateError) => logger.error("session.snapshot.health_update_failed", updateError, { accountId, reason }));
    return false;
  }
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

  const snapshot = JSON.parse(decryptSensitiveField(parseEncryptedField(session.sessionDataEncrypted), sessionKeyring())) as SessionSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.files)) throw new Error("INVALID_WHATSAPP_SESSION_SNAPSHOT");
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
      const snapshot = JSON.parse(decryptSensitiveField(parseEncryptedField(session.sessionDataEncrypted), sessionKeyring())) as SessionSnapshot;
      if (snapshot.version === 1 && Array.isArray(snapshot.files) && snapshotHasRegisteredCredentials(snapshot)) return true;
    } catch (error) {
      logger.warn("session.snapshot.restorable_check_failed", { accountId, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return false;
}

export async function clearWhatsAppSession(accountId: string) {
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
