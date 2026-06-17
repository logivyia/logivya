/**
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Session files may only be manipulated through this module.
 */
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/server/db";

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

export async function clearWhatsAppSession(accountId: string) {
  await rm(whatsappSessionDirectory(accountId), { recursive: true, force: true });
  await prisma.whatsAppSession.deleteMany({ where: { accountId } });
}
