/**
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WASocket } from "@whiskeysockets/baileys";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import { clearWhatsAppSession, ensureWhatsAppSessionRoot, hasWhatsAppCredentials, whatsappSessionDirectory } from "@/lib/whatsapp/session-manager";
import type { GroupResult, SendGroupMessageInput, SendResult, SessionResult, WhatsAppProvider } from "@/server/whatsapp/provider";

const sockets = new Map<string, WASocket>();
const manuallyDisconnected = new Set<string>();
const sessionModes = new Map<string, "QR" | "PAIRING">();
const sessionRestarts = new Map<string, Promise<WASocket>>();

function maskPhoneNumber(phoneNumber?: string | null) {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

async function auditAccount(accountId: string, action: string, metadata: Record<string, unknown> = {}) {
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { companyId: true } });
  if (!account) return;
  const auditMetadata = JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
  await prisma.auditLog.create({ data: { companyId: account.companyId, action, entityType: "WhatsAppAccount", entityId: accountId, metadata: auditMetadata } });
}

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private async waitForConnectedSocket(accountId: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const socket = sockets.get(accountId);
      if (socket?.user) return socket;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("WHATSAPP_SESSION_CONNECTION_TIMEOUT");
  }

  private async ensureConnectedSocket(accountId: string) {
    const activeSocket = sockets.get(accountId);
    if (activeSocket?.user) return activeSocket;

    const existingRestart = sessionRestarts.get(accountId);
    if (existingRestart) return existingRestart;

    const restart = (async () => {
      const account = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { id: true, archivedAt: true },
      });
      if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");

      if (!(await hasWhatsAppCredentials(accountId))) {
        await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: { status: "RECONNECT_REQUIRED", lastError: "WhatsApp bağlantısını QR kod veya telefon koduyla yeniden kurun." },
        });
        throw new Error("WHATSAPP_RECONNECT_REQUIRED");
      }

      logger.info("whatsapp.session.recovery_started", { accountId });
      if (!sockets.has(accountId)) {
        const { initialized } = await this.startSession(accountId, "QR");
        await initialized;
      }
      const socket = await this.waitForConnectedSocket(accountId);
      logger.info("whatsapp.session.recovery_completed", { accountId });
      return socket;
    })().finally(() => sessionRestarts.delete(accountId));

    sessionRestarts.set(accountId, restart);
    return restart;
  }

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
    await clearWhatsAppSession(accountId);
  }

  async requestPairingCode(accountId: string, phoneNumber: string): Promise<{ code: string; expiresAt: Date }> {
    const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
    logger.info("whatsapp.pairing.request_started", { accountId, phoneNumber: maskPhoneNumber(normalized) });
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
      logger.info("whatsapp.pairing.code_generated", { accountId, phoneNumber: maskPhoneNumber(normalized), expiresAt: expiresAt.toISOString() });
      await auditAccount(accountId, "whatsapp.pairing.code_generated", { phoneNumber: maskPhoneNumber(normalized), expiresAt: expiresAt.toISOString() });
      return { code, expiresAt };
    } catch (error) {
      logger.error("whatsapp.pairing.failed", error, { accountId, phoneNumber: maskPhoneNumber(normalized) });
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
    await ensureWhatsAppSessionRoot();
    const directory = whatsappSessionDirectory(accountId);
    // Baileys uses this name for its auth-state factory; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const { version } = await fetchLatestBaileysVersion();
    const activated = await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: state.creds.registered ? "CONNECTING" : mode === "PAIRING" ? "PENDING_PAIRING" : "PENDING_QR", lastError: null },
    });
    if (!activated.count) {
      throw new Error("WhatsApp account no longer exists");
    }

    logger.info("whatsapp.session.starting", { accountId, mode, registered: state.creds.registered });
    const socket = makeWASocket({ auth: state, version, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false });
    sockets.set(accountId, socket);

    let initializedSettled = false;
    let initializationTimeout: ReturnType<typeof setTimeout> | undefined;
    let settleInitialized: (error?: unknown) => void = () => undefined;
    const initialized = new Promise<void>((resolve, reject) => {
      settleInitialized = (error?: unknown) => {
        if (initializedSettled) return;
        initializedSettled = true;
        if (initializationTimeout) clearTimeout(initializationTimeout);
        if (error) reject(error);
        else resolve();
      };
      initializationTimeout = setTimeout(() => settleInitialized(new Error("WhatsApp socket initialization timed out.")), 12_000);
    });

    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      try {
        const currentMode = sessionModes.get(accountId) || mode;
        if (qr && currentMode === "QR") {
          logger.info("whatsapp.qr.received", { accountId });
          const qrCode = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
          const account = await prisma.whatsAppAccount.findUnique({ where: { id: accountId }, select: { id: true, archivedAt: true } });
          if (!account || account.archivedAt) {
            await this.stopSocket(accountId, "WhatsApp account no longer exists");
            settleInitialized(new Error("WhatsApp account no longer exists"));
            return;
          }
          const expiresAt = new Date(Date.now() + 60_000);
          await prisma.whatsAppSession.upsert({
            where: { id: accountId },
            update: { qrCode, status: "PENDING_QR", expiresAt },
            create: { id: accountId, accountId, qrCode, status: "PENDING_QR", expiresAt },
          });
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "PENDING_QR", qrCode, qrExpiresAt: expiresAt, lastError: null } });
          logger.info("whatsapp.qr.saved", { accountId, expiresAt: expiresAt.toISOString() });
          await auditAccount(accountId, "whatsapp.qr.generated", { expiresAt: expiresAt.toISOString() });
          settleInitialized();
        }
        if (connection === "connecting") {
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null, status: { in: ["PAIRING_CODE_READY", "PENDING_QR"] } }, data: { status: "CONNECTING" } });
          if (currentMode === "PAIRING") settleInitialized();
        }
        if (connection === "open") {
          const phoneNumber = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0];
          const updated = await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTED", phoneNumber, displayName: socket.user?.name, lastConnectedAt: new Date(), qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
          if (!updated.count) return;
          await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTED", qrCode: null, expiresAt: null } });
          logger.info("whatsapp.connection.open", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          await auditAccount(accountId, "whatsapp.connected", { phoneNumber: maskPhoneNumber(phoneNumber), mode: currentMode });
          settleInitialized();
          await this.syncGroups(accountId);
        }
        if (connection === "close") {
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          const intentional = manuallyDisconnected.delete(accountId);
          if (sockets.get(accountId) === socket) sockets.delete(accountId);
          logger.warn("whatsapp.connection.closed", { accountId, code, loggedOut, intentional, mode: currentMode });
          if (!initializedSettled) settleInitialized(lastDisconnect?.error instanceof Error ? lastDisconnect.error : new Error("WhatsApp socket closed before initialization."));
          if (intentional) return;
          if (currentMode === "PAIRING") {
            if (code === DisconnectReason.restartRequired) {
              await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTING", pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
              setTimeout(() => {
                void this.startSession(accountId, "PAIRING")
                  .then(({ initialized: nextInitialized }) => nextInitialized)
                  .catch((error) => logger.error("whatsapp.pairing.restart_failed", error, { accountId }));
              }, 1_000);
              return;
            }
            const reason = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "WhatsApp pairing connection closed";
            logger.error("whatsapp.pairing.connection_closed", lastDisconnect?.error, { accountId, code });
            await clearWhatsAppSession(accountId);
            await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: pairingUserMessage(lastDisconnect?.error) } });
            await auditAccount(accountId, "whatsapp.pairing.failed", { reason, code });
            return;
          }
          const updated = await prisma.whatsAppAccount.updateMany({
            where: { id: accountId, archivedAt: null },
            data: {
              status: loggedOut ? "RECONNECT_REQUIRED" : state.creds.registered ? "DISCONNECTED" : "FAILED",
              lastDisconnectedAt: new Date(),
              lastError: loggedOut ? "Bağlantı yeniden kurulmalı." : state.creds.registered ? "Bağlantı geçici olarak kesildi. Yeniden bağlanılıyor." : "Bağlantı başarısız oldu. Yeni kod veya QR ile tekrar deneyin.",
            },
          });
          await auditAccount(accountId, "whatsapp.failed", { code, loggedOut, mode: currentMode });
          if (updated.count && !loggedOut && state.creds.registered) {
            setTimeout(() => {
              void this.startSession(accountId, "QR")
                .then(({ initialized: nextInitialized }) => nextInitialized)
                .catch((error) => logger.error("whatsapp.session.auto_reconnect_failed", error, { accountId }));
            }, 5_000);
          }
        }
      } catch (error) {
        if (sockets.get(accountId) === socket) sockets.delete(accountId);
        logger.error("whatsapp.connection.update_failed", error, { accountId, mode: sessionModes.get(accountId) || mode });
        if (!initializedSettled) settleInitialized(error);
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
    const socket = await this.ensureConnectedSocket(accountId);
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
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (["RECONNECT_REQUIRED", "FAILED", "ERROR"].includes(account.status)) throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    const socket = await this.ensureConnectedSocket(input.accountId);
    const result = await socket.sendMessage(input.groupExternalId, { text: input.content });
    if (!result?.key.id) throw new Error("WhatsApp did not return a message id");
    return { externalMessageId: result.key.id };
  }
}
