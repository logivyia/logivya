import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WASocket } from "@whiskeysockets/baileys";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import type { GroupResult, SendGroupMessageInput, SendResult, SessionResult, WhatsAppProvider } from "@/server/whatsapp/provider";

const sockets = new Map<string, WASocket>();
const manuallyDisconnected = new Set<string>();
const sessionModes = new Map<string, "QR" | "PAIRING">();
const sessionRoot = path.resolve(process.env.WHATSAPP_SESSION_DIR || path.join(process.cwd(), "sessions"));

async function auditAccount(accountId: string, action: string, metadata: Record<string, unknown> = {}) {
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { companyId: true } });
  if (!account) return;
  const auditMetadata = JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
  await prisma.auditLog.create({ data: { companyId: account.companyId, action, entityType: "WhatsAppAccount", entityId: accountId, metadata: auditMetadata } });
}

function accountSessionDirectory(accountId: string) {
  const directory = path.resolve(sessionRoot, accountId);
  const relative = path.relative(sessionRoot, directory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("INVALID_SESSION_PATH");
  return directory;
}

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private async stopSocket(accountId: string, reason: string) {
    const socket = sockets.get(accountId);
    if (socket) {
      manuallyDisconnected.add(accountId);
      socket.end(new Error(reason));
      sockets.delete(accountId);
    }
    sessionModes.delete(accountId);
  }

  private async clearTemporaryAuth(accountId: string) {
    await this.stopSocket(accountId, "Pairing session reset");
    await rm(accountSessionDirectory(accountId), { recursive: true, force: true });
    await prisma.whatsAppSession.deleteMany({ where: { accountId } });
  }

  private waitForSocketInitialization(socket: WASocket) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.ev.off("connection.update", listener);
        reject(new Error("WhatsApp socket initialization timed out."));
      }, 12_000);
      const listener = ({ connection, qr, lastDisconnect }: { connection?: string; qr?: string; lastDisconnect?: { error?: unknown } }) => {
        if (connection === "connecting" || connection === "open" || qr) {
          clearTimeout(timeout);
          socket.ev.off("connection.update", listener);
          resolve();
        } else if (connection === "close") {
          clearTimeout(timeout);
          socket.ev.off("connection.update", listener);
          reject(lastDisconnect?.error instanceof Error ? lastDisconnect.error : new Error("WhatsApp socket closed before pairing."));
        }
      };
      socket.ev.on("connection.update", listener);
    });
  }

  async requestPairingCode(accountId: string, phoneNumber: string): Promise<{ code: string; expiresAt: Date }> {
    const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
    await this.clearTemporaryAuth(accountId);
    sessionModes.set(accountId, "PAIRING");
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { status: "PENDING_PAIRING", phoneNumber: normalized, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
    });

    try {
      const { socket, registered, initialized } = await this.startSession(accountId, "PAIRING");
      if (registered) throw new Error("Pairing requires a clean unregistered auth state.");
      await initialized;
      const code = await socket.requestPairingCode(normalized);
      const expiresAt = new Date(Date.now() + 5 * 60_000);
      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: { status: "PAIRING_CODE_READY", phoneNumber: normalized, pairingCode: code, pairingCodeExpiresAt: expiresAt, lastError: null },
      });
      await auditAccount(accountId, "whatsapp.pairing.code_generated", { phoneNumber: normalized, expiresAt: expiresAt.toISOString() });
      return { code, expiresAt };
    } catch (error) {
      logger.error("whatsapp.pairing.failed", error, { accountId, phoneNumber: normalized });
      await this.clearTemporaryAuth(accountId);
      const message = pairingUserMessage(error);
      await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: message } });
      await auditAccount(accountId, "whatsapp.pairing.failed", { reason: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async requestQrCode(accountId: string) {
    if (!sockets.has(accountId)) await this.createSession(accountId);
    for (let i = 0; i < 20; i += 1) {
      const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
      if (account?.qrCode && account.qrExpiresAt && account.qrExpiresAt > new Date()) return { qr: account.qrCode, expiresAt: account.qrExpiresAt };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("QR_GENERATION_TIMEOUT");
  }

  async getStatus(accountId: string) {
    return (await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } })).status;
  }

  private async startSession(accountId: string, mode: "QR" | "PAIRING") {
    manuallyDisconnected.delete(accountId);
    sessionModes.set(accountId, mode);
    await mkdir(sessionRoot, { recursive: true });
    const directory = accountSessionDirectory(accountId);
    // Baileys uses this name for its auth-state factory; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const { version } = await fetchLatestBaileysVersion();
    const socket = makeWASocket({ auth: state, version, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false });
    const initialized = this.waitForSocketInitialization(socket);
    sockets.set(accountId, socket);
    const activated = await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: mode === "PAIRING" ? "PENDING_PAIRING" : "PENDING_QR", lastError: null },
    });
    if (!activated.count) {
      sockets.delete(accountId);
      socket.end(new Error("WhatsApp account no longer exists"));
      throw new Error("WhatsApp account no longer exists");
    }

    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      try {
        const currentMode = sessionModes.get(accountId) || mode;
        if (qr && currentMode === "QR") {
          const qrCode = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
          const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { id: true, archivedAt: true } });
          if (!account || account.archivedAt) {
            await this.stopSocket(accountId, "WhatsApp account no longer exists");
            return;
          }
          const expiresAt = new Date(Date.now() + 60_000);
          await prisma.whatsAppSession.upsert({
            where: { id: accountId },
            update: { qrCode, status: "PENDING_QR", expiresAt },
            create: { id: accountId, accountId, qrCode, status: "PENDING_QR", expiresAt },
          });
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "PENDING_QR", qrCode, qrExpiresAt: expiresAt, lastError: null } });
          await auditAccount(accountId, "whatsapp.qr.generated", { expiresAt: expiresAt.toISOString() });
        }
        if (connection === "connecting") {
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null, status: { in: ["PAIRING_CODE_READY", "PENDING_QR"] } }, data: { status: "CONNECTING" } });
        }
        if (connection === "open") {
          const phoneNumber = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0];
          const updated = await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTED", phoneNumber, displayName: socket.user?.name, lastConnectedAt: new Date(), qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
          if (!updated.count) return;
          await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTED", qrCode: null, expiresAt: null } });
          await auditAccount(accountId, "whatsapp.connected", { phoneNumber, mode: currentMode });
          await this.syncGroups(accountId);
        }
        if (connection === "close") {
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          const intentional = manuallyDisconnected.delete(accountId);
          if (sockets.get(accountId) === socket) sockets.delete(accountId);
          if (intentional) return;
          if (currentMode === "PAIRING") {
            if (code === DisconnectReason.restartRequired) {
              await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTING", pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
              setTimeout(() => {
                void this.startSession(accountId, "PAIRING")
                  .then(({ initialized }) => initialized)
                  .catch((error) => logger.error("whatsapp.pairing.restart_failed", error, { accountId }));
              }, 1_000);
              return;
            }
            const reason = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "WhatsApp pairing connection closed";
            logger.error("whatsapp.pairing.connection_closed", lastDisconnect?.error, { accountId, code });
            await rm(accountSessionDirectory(accountId), { recursive: true, force: true });
            await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: pairingUserMessage(lastDisconnect?.error) } });
            await auditAccount(accountId, "whatsapp.pairing.failed", { reason, code });
            return;
          }
          const updated = await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: loggedOut ? "RECONNECT_REQUIRED" : mode === "QR" ? "FAILED" : "DISCONNECTED", lastDisconnectedAt: new Date(), lastError: loggedOut ? "Bağlantı yeniden kurulmalı." : "Bağlantı başarısız oldu. Yeni kod veya QR ile tekrar deneyin." } });
          await auditAccount(accountId, "whatsapp.failed", { code, loggedOut, mode: currentMode });
          if (updated.count && !loggedOut) setTimeout(() => void this.reconnect(accountId), 5000);
        }
      } catch (error) {
        if (sockets.get(accountId) === socket) sockets.delete(accountId);
        logger.error("whatsapp.connection.update_failed", error, { accountId, mode: sessionModes.get(accountId) || mode });
      }
    });
    return { socket, registered: state.creds.registered, initialized };
  }

  async createSession(accountId: string): Promise<SessionResult> {
    if (sockets.has(accountId)) return { sessionId: accountId, qrCode: await this.getQr(accountId) };
    const { initialized } = await this.startSession(accountId, "QR");
    await initialized;
    return { sessionId: accountId, qrCode: null };
  }

  async getQr(accountId: string) {
    return (await prisma.whatsAppSession.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } }))?.qrCode ?? null;
  }

  async disconnect(accountId: string) {
    await this.stopSocket(accountId, "Manual disconnect");
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "DISCONNECTED", lastDisconnectedAt: new Date(), lastError: null } });
  }

  async reconnect(accountId: string) {
    await this.clearTemporaryAuth(accountId);
    await auditAccount(accountId, "whatsapp.session.cleaned");
    await this.createSession(accountId);
  }

  async syncGroups(accountId: string): Promise<GroupResult[]> {
    const socket = sockets.get(accountId);
    if (!socket) throw new Error("WhatsApp session is not active");
    const metadata = await socket.groupFetchAllParticipating();
    const groups = Object.values(metadata).map((group) => ({ externalId: group.id, name: group.subject, description: group.desc, participantCount: group.participants.length, canSend: !group.announce }));
    const account = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } });
    await prisma.$transaction(groups.map((group) => prisma.whatsAppGroup.upsert({
      where: { accountId_externalGroupId: { accountId, externalGroupId: group.externalId } },
      update: { name: group.name, description: group.description, participantCount: group.participantCount, canSend: group.canSend, isArchived: false, lastSyncedAt: new Date() },
      create: { companyId: account.companyId, accountId, externalGroupId: group.externalId, name: group.name, description: group.description, participantCount: group.participantCount, canSend: group.canSend, lastSyncedAt: new Date() },
    })));
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { lastSyncedAt: new Date() } });
    await auditAccount(accountId, "whatsapp.groups.synced", { count: groups.length });
    return groups;
  }

  async sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId } });
    if (account?.status !== "CONNECTED") throw new Error("WhatsApp account is not connected.");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    const socket = sockets.get(input.accountId);
    if (!socket) throw new Error("WhatsApp session is not active");
    const result = await socket.sendMessage(input.groupExternalId, { text: input.content });
    if (!result?.key.id) throw new Error("WhatsApp did not return a message id");
    return { externalMessageId: result.key.id };
  }
}
