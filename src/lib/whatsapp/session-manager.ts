/**
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
    await access(path.join(whatsappSessionDirectory(accountId), "creds.json"));
    return true;
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

export async function backupWhatsAppSessionToDatabase(accountId: string, reason = "snapshot") {
  try {
    const directory = whatsappSessionDirectory(accountId);
    const relativeFiles = await listSessionFiles(directory);
    if (!relativeFiles.includes("creds.json")) return false;

    const files = await Promise.all(relativeFiles.map(async (relativePath) => ({
      relativePath: assertSafeRelativeSessionPath(relativePath),
      data: (await readFile(path.join(directory, relativePath))).toString("base64"),
    })));
    const snapshot: SessionSnapshot = { version: 1, files };
    const sessionDataEncrypted = serializeEncryptedField(encryptSensitiveField(JSON.stringify(snapshot), sessionKeyring()));

    await prisma.whatsAppSession.upsert({
      where: { accountId },
      update: {
        sessionDataEncrypted,
        status: AccountStatus.CONNECTED,
        qrCode: null,
        expiresAt: null,
        lastHeartbeatAt: new Date(),
        snapshotReason: reason,
      },
      create: {
        accountId,
        sessionDataEncrypted,
        status: AccountStatus.CONNECTED,
        lastHeartbeatAt: new Date(),
        snapshotReason: reason,
      },
    });
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { sessionSnapshotAt: new Date() },
    });
    logger.info("session.snapshot.saved", { accountId, reason });
    return true;
  } catch (error) {
    logger.error("session.snapshot.failed", error, { accountId, reason });
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { lastError: "WHATSAPP_SESSION_SNAPSHOT_FAILED", recoveryLevel: 1, healthScore: 65 },
    }).catch((updateError) => logger.error("session.snapshot.health_update_failed", updateError, { accountId, reason }));
    return false;
  }
}

export async function restoreWhatsAppSessionFromDatabase(accountId: string) {
  if (await hasWhatsAppCredentials(accountId)) return true;
  const session = await prisma.whatsAppSession.findFirst({
    where: { accountId, sessionDataEncrypted: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!session?.sessionDataEncrypted) return false;

  const snapshot = JSON.parse(decryptSensitiveField(parseEncryptedField(session.sessionDataEncrypted), sessionKeyring())) as SessionSnapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.files)) throw new Error("INVALID_WHATSAPP_SESSION_SNAPSHOT");

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
  }
  return restored;
}

export async function hasRestorableWhatsAppCredentials(accountId: string) {
  if (await hasWhatsAppCredentials(accountId)) return true;
  return Boolean(await prisma.whatsAppSession.findFirst({
    where: { accountId, sessionDataEncrypted: { not: null } },
    select: { id: true },
  }));
}

export async function clearWhatsAppSession(accountId: string) {
  await rm(whatsappSessionDirectory(accountId), { recursive: true, force: true });
  await prisma.whatsAppSession.deleteMany({ where: { accountId } });
}
