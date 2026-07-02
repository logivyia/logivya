/**
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WAMessageKey, type WASocket } from "@whiskeysockets/baileys";
import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { computeWhatsAppHealthScore } from "@/server/whatsapp/connection-health";
import { pairingUserMessage } from "@/server/whatsapp/pairing-errors";
import { normalizeWhatsAppPhoneNumber } from "@/server/whatsapp/phone";
import {
  backupWhatsAppSessionToDatabase,
  clearWhatsAppSession,
  ensureWhatsAppSessionRoot,
  hasRestorableWhatsAppCredentials,
  restoreWhatsAppSessionFromDatabase,
  whatsappSessionDirectory,
} from "@/lib/whatsapp/session-manager";
import type { DeleteGroupMessageInput, DeleteResult, GroupResult, SendGroupMessageInput, SendResult, SessionResult, WhatsAppProvider } from "@/server/whatsapp/provider";

type SessionMode = "PAIR_QR" | "PAIR_PHONE" | "RESTORE" | "RECONNECT";

const sockets = new Map<string, WASocket>();
const manuallyDisconnected = new Set<string>();
const sessionModes = new Map<string, SessionMode>();
const sessionRestarts = new Map<string, Promise<WASocket>>();
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const qrTransientRetries = new Map<string, number>();
const pairingTransientRetries = new Map<string, number>();
const SOCKET_INITIALIZATION_TIMEOUT_MS = Number(process.env.WHATSAPP_SOCKET_INITIALIZATION_TIMEOUT_MS || 30_000);
const PAIRING_SOCKET_BOOTSTRAP_MS = Number(process.env.WHATSAPP_PAIRING_SOCKET_BOOTSTRAP_MS || 3_000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.WHATSAPP_HEARTBEAT_INTERVAL_MS || 30_000);
const QR_TRANSIENT_RETRY_LIMIT = Number(process.env.WHATSAPP_QR_TRANSIENT_RETRY_LIMIT || 3);
const PAIRING_TRANSIENT_RETRY_LIMIT = Number(process.env.WHATSAPP_PAIRING_TRANSIENT_RETRY_LIMIT || 5);
const RECONNECT_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 120_000] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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

  private stopHeartbeat(accountId: string) {
    const timer = heartbeatTimers.get(accountId);
    if (timer) clearInterval(timer);
    heartbeatTimers.delete(accountId);
  }

  private scheduleReconnect(accountId: string, reason: string) {
    if (reconnectTimers.has(accountId)) return;
    void prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { reconnectRetryCount: true, archivedAt: true, lastError: true },
    }).then((account) => {
      if (!account || account.archivedAt || account.lastError === "WHATSAPP_LOGGED_OUT" || account.lastError === "WHATSAPP_CREDENTIALS_MISSING") return;
      const attempt = Math.max(0, account.reconnectRetryCount);
      const baseDelay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
      const delay = baseDelay + Math.floor(Math.random() * Math.min(baseDelay, 5_000));
      logger.warn("whatsapp.session.reconnect_scheduled", { accountId, attempt: attempt + 1, delayMs: delay, reason });
      const timer = setTimeout(() => {
        reconnectTimers.delete(accountId);
        void prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: { status: "CONNECTING", reconnectRetryCount: { increment: 1 }, lastError: "WHATSAPP_TRANSIENT_DISCONNECT" },
        }).then(() => this.ensureConnectedSocket(accountId))
          .catch((error) => {
            logger.error("whatsapp.session.auto_reconnect_failed", error, { accountId, attempt: attempt + 1 });
            this.scheduleReconnect(accountId, errorMessage(error));
          });
      }, delay);
      timer.unref?.();
      reconnectTimers.set(accountId, timer);
    }).catch((error) => logger.error("whatsapp.session.reconnect_schedule_failed", error, { accountId }));
  }

  private startHeartbeat(accountId: string, socket: WASocket) {
    this.stopHeartbeat(accountId);
    const beat = async () => {
      const now = new Date();
      const healthy = sockets.get(accountId) === socket && Boolean(socket.user);
      const groupCount = await prisma.whatsAppGroup.count({ where: { accountId, isArchived: false } }).catch(() => 0);
      const healthScore = computeWhatsAppHealthScore({
        status: healthy ? "CONNECTED" : "DISCONNECTED",
        lastHeartbeatAt: now,
        lastPongAt: healthy ? now : null,
        groupCount,
        hasSessionSnapshot: true,
      });
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: {
          lastHeartbeatAt: now,
          lastPingAt: now,
          lastPongAt: healthy ? now : undefined,
          healthScore,
          ...(healthy ? { status: "CONNECTED" as const, lastError: null, reconnectRetryCount: 0, recoveryLevel: 0 } : { recoveryLevel: 1 }),
        },
      });
      await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { lastHeartbeatAt: now } });
      if (!healthy) {
        logger.warn("whatsapp.heartbeat_fail", { accountId });
        this.stopHeartbeat(accountId);
        this.scheduleReconnect(accountId, "heartbeat_fail");
      }
    };
    void beat().catch((error) => logger.error("whatsapp.heartbeat.failed", error, { accountId }));
    const timer = setInterval(() => void beat().catch((error) => logger.error("whatsapp.heartbeat.failed", error, { accountId })), HEARTBEAT_INTERVAL_MS);
    timer.unref?.();
    heartbeatTimers.set(accountId, timer);
  }

  private async ensureConnectedSocket(accountId: string) {
    const activeSocket = sockets.get(accountId);
    if (activeSocket?.user) return activeSocket;

    const existingRestart = sessionRestarts.get(accountId);
    if (existingRestart) return existingRestart;

    const restart = (async () => {
      const account = await prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { id: true, archivedAt: true, status: true, lastError: true },
      });
      if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");

      if (!(await hasRestorableWhatsAppCredentials(accountId))) {
        await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING" },
        });
        throw new Error("WHATSAPP_RECONNECT_REQUIRED");
      }
      await restoreWhatsAppSessionFromDatabase(accountId);

      logger.info("SESSION_RESTORED", { accountId, level: 3 });
      logger.info("whatsapp.session.recovery_started", { accountId });
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null, status: { in: ["DISCONNECTED", "RECONNECT_REQUIRED", "FAILED", "ERROR"] } },
        data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 },
      });
      const existingSocket = sockets.get(accountId);
      if (existingSocket && !existingSocket.user) {
        await this.stopSocket(accountId, "Replace stale WhatsApp socket");
      }
      if (!sockets.has(accountId)) {
        const { initialized } = await this.startSession(accountId, "RECONNECT");
        await initialized;
      }
      const socket = await this.waitForConnectedSocket(accountId);
      logger.info("SESSION_RECONNECTED", { accountId });
      logger.info("whatsapp.session.recovery_completed", { accountId });
      return socket;
    })().finally(() => sessionRestarts.delete(accountId));

    sessionRestarts.set(accountId, restart);
    return restart;
  }

  private async stopSocket(accountId: string, reason: string) {
    this.stopHeartbeat(accountId);
    const reconnectTimer = reconnectTimers.get(accountId);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimers.delete(accountId);
    const socket = sockets.get(accountId);
    if (socket) {
      manuallyDisconnected.add(accountId);
      socket.end(new Error(reason));
      sockets.delete(accountId);
    }
    sessionModes.delete(accountId);
  }

  private async clearTemporaryAuth(accountId: string) {
    await this.stopSocket(accountId, "Fresh pairing session reset");
    await clearWhatsAppSession(accountId);
  }

  private async hasActivePairingCode(accountId: string) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { pairingCode: true, pairingCodeExpiresAt: true },
    });

    return Boolean(account?.pairingCode && account.pairingCodeExpiresAt && account.pairingCodeExpiresAt > new Date());
  }

  private async preserveActivePairingCode(accountId: string, reason: string, code?: number) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: accountId },
      select: { archivedAt: true, pairingCode: true, pairingCodeExpiresAt: true },
    });
    if (!account || account.archivedAt || !account.pairingCode || !account.pairingCodeExpiresAt || account.pairingCodeExpiresAt <= new Date()) return false;

    const nextAttempt = (pairingTransientRetries.get(accountId) ?? 0) + 1;
    pairingTransientRetries.set(accountId, nextAttempt);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "PAIRING_CODE_READY",
        lastError: null,
        recoveryLevel: Math.min(nextAttempt, 5),
        healthScore: 35,
      },
    });
    logger.warn("whatsapp.pairing.connection_closed_after_code_preserved", {
      accountId,
      code,
      attempt: nextAttempt,
      maxAttempts: PAIRING_TRANSIENT_RETRY_LIMIT,
      reason,
    });
    await auditAccount(accountId, "whatsapp.pairing.code_preserved", { code, attempt: nextAttempt, reason }).catch((error) =>
      logger.warn("whatsapp.pairing.preserve_audit_failed", { accountId, reason: errorMessage(error) }),
    );

    if (nextAttempt <= PAIRING_TRANSIENT_RETRY_LIMIT) {
      const delay = Math.min(1_000 * nextAttempt, 5_000);
      setTimeout(() => {
        if (sockets.has(accountId)) return;
        void this.startSession(accountId, "PAIR_PHONE")
          .then(({ initialized: nextInitialized }) => nextInitialized)
          .catch((error) => logger.error("whatsapp.pairing.preserved_code_reconnect_failed", error, { accountId, attempt: nextAttempt }));
      }, delay);
    } else {
      logger.warn("whatsapp.pairing.preserved_code_retry_limit_reached", { accountId, code, attempts: nextAttempt });
    }
    return true;
  }

  async requestPairingCode(accountId: string, phoneNumber: string): Promise<{ code: string; expiresAt: Date }> {
    const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
    pairingTransientRetries.delete(accountId);
    logger.info("whatsapp.pairing.requested", { accountId, phoneNumber: maskPhoneNumber(normalized) });
    logger.info("whatsapp.pairing.request_started", { accountId, phoneNumber: maskPhoneNumber(normalized) });
    await this.clearTemporaryAuth(accountId);
    sessionModes.set(accountId, "PAIR_PHONE");
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { status: "PENDING_PAIRING", phoneNumber: normalized, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null },
    });

    try {
      let session = await this.startSession(accountId, "PAIR_PHONE");
      if (session.registered) throw new Error("Pairing requires a clean unregistered auth state.");

      const waitForPairingBootstrap = async (attempt: number) => {
        const readiness = session.initialized
          .then(() => true)
          .catch((error) => {
            logger.warn("whatsapp.pairing.initialization_deferred_failed", {
              accountId,
              attempt,
              reason: errorMessage(error),
            });
            return false;
          });
        const ready = await Promise.race([readiness, sleep(PAIRING_SOCKET_BOOTSTRAP_MS).then(() => false)]);
        if (!ready) logger.warn("whatsapp.pairing.socket_bootstrap_wait_timeout", { accountId, attempt });
      };

      const requestFromActiveSocket = async (attempt: number) => {
        await waitForPairingBootstrap(attempt);
        const activeSocket = sockets.get(accountId) ?? session.socket;
        if (activeSocket !== session.socket) logger.info("whatsapp.pairing.socket_replaced", { accountId, attempt });
        logger.info("whatsapp.pairing.provider_request", {
          accountId,
          attempt,
          phoneNumber: maskPhoneNumber(normalized),
        });
        return activeSocket.requestPairingCode(normalized);
      };

      let code: string;
      try {
        code = await requestFromActiveSocket(1);
      } catch (requestError) {
        logger.warn("whatsapp.pairing.provider_request_retry", {
          accountId,
          reason: errorMessage(requestError),
        });
        await this.clearTemporaryAuth(accountId);
        await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null },
          data: {
            status: "PENDING_PAIRING",
            phoneNumber: normalized,
            qrCode: null,
            qrExpiresAt: null,
            pairingCode: null,
            pairingCodeExpiresAt: null,
            lastError: null,
          },
        });
        session = await this.startSession(accountId, "PAIR_PHONE");
        if (session.registered) throw new Error("Pairing requires a clean unregistered auth state.");
        code = await requestFromActiveSocket(2);
      }
      const expiresAt = new Date(Date.now() + 5 * 60_000);
      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: { status: "PAIRING_CODE_READY", phoneNumber: normalized, pairingCode: code, pairingCodeExpiresAt: expiresAt, lastError: null },
      });
      logger.info("whatsapp.pairing.ready", { accountId, phoneNumber: maskPhoneNumber(normalized), expiresAt: expiresAt.toISOString() });
      logger.info("whatsapp.pairing.code_generated", { accountId, phoneNumber: maskPhoneNumber(normalized), expiresAt: expiresAt.toISOString() });
      await auditAccount(accountId, "whatsapp.pairing.code_generated", { phoneNumber: maskPhoneNumber(normalized), expiresAt: expiresAt.toISOString() });
      return { code, expiresAt };
    } catch (error) {
      logger.error("whatsapp.connection.failed", error, { accountId, mode: "PAIR_PHONE", phoneNumber: maskPhoneNumber(normalized), reason: errorMessage(error) });
      logger.error("whatsapp.pairing.failed", error, { accountId, phoneNumber: maskPhoneNumber(normalized) });
      await this.clearTemporaryAuth(accountId);
      const message = pairingUserMessage(error);
      await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: message } });
      await auditAccount(accountId, "whatsapp.pairing.failed", { reason: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async requestQrCode(accountId: string) {
    const existing = await prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (existing?.qrCode && existing.qrExpiresAt && existing.qrExpiresAt > new Date()) {
      return { qr: existing.qrCode, expiresAt: existing.qrExpiresAt };
    }
    await this.createFreshQrSession(accountId);
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

  private async startSession(accountId: string, mode: SessionMode) {
    manuallyDisconnected.delete(accountId);
    sessionModes.set(accountId, mode);
    await ensureWhatsAppSessionRoot();
    await restoreWhatsAppSessionFromDatabase(accountId);
    const directory = whatsappSessionDirectory(accountId);
    // Baileys uses this name for its auth-state factory; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const { version } = await fetchLatestBaileysVersion();
    if (!state.creds.registered && mode !== "PAIR_QR" && mode !== "PAIR_PHONE") {
      logger.warn("whatsapp.restore.credentials_missing", { accountId, mode });
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING", recoveryLevel: 5, healthScore: 0 },
      });
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
    const activated = await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: state.creds.registered ? "CONNECTING" : mode === "PAIR_PHONE" ? "PENDING_PAIRING" : "PENDING_QR", lastError: null },
    });
    if (!activated.count) {
      throw new Error("WhatsApp account no longer exists");
    }

    logger.info("whatsapp.baileys.start", { accountId, mode, registered: state.creds.registered, sessionDirectory: directory });
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
      initializationTimeout = setTimeout(() => settleInitialized(new Error("WhatsApp socket initialization timed out.")), SOCKET_INITIALIZATION_TIMEOUT_MS);
    });

    socket.ev.on("creds.update", async () => {
      await saveCreds();
      await backupWhatsAppSessionToDatabase(accountId, "creds.update").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
    });
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      try {
        const currentMode = sessionModes.get(accountId) || mode;
        if (qr && currentMode === "PAIR_QR") {
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
            update: { qrCode, status: "QR_READY", expiresAt },
            create: { id: accountId, accountId, qrCode, status: "QR_READY", expiresAt },
          });
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "QR_READY", qrCode, qrExpiresAt: expiresAt, lastError: null } });
          qrTransientRetries.delete(accountId);
          logger.info("whatsapp.qr.saved", { accountId, expiresAt: expiresAt.toISOString() });
          await auditAccount(accountId, "whatsapp.qr.generated", { expiresAt: expiresAt.toISOString() });
          settleInitialized();
        } else if (qr) {
          logger.warn("whatsapp.qr.ignored_for_restore", { accountId, mode: currentMode });
        }
        if (connection === "connecting") {
          await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null, status: { in: ["PENDING_PAIRING", "PENDING_QR"] } }, data: { status: "CONNECTING" } });
          if (currentMode === "PAIR_PHONE") settleInitialized();
        }
        if (connection === "open") {
          pairingTransientRetries.delete(accountId);
          const phoneNumber = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0];
          const deviceId = socket.user?.id ?? null;
          const updated = await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTED", phoneNumber, displayName: socket.user?.name, deviceId, lastConnectedAt: new Date(), lastHeartbeatAt: new Date(), lastPongAt: new Date(), reconnectRetryCount: 0, recoveryLevel: 0, healthScore: 95, qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
          if (!updated.count) return;
          await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTED", qrCode: null, expiresAt: null } });
          await backupWhatsAppSessionToDatabase(accountId, "connection.open").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
          this.startHeartbeat(accountId, socket);
          logger.info("SESSION_CREATED", { accountId, mode: currentMode });
          logger.info("whatsapp.connected", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          logger.info("whatsapp.connection.open", { accountId, mode: currentMode, phoneNumber: maskPhoneNumber(phoneNumber) });
          await auditAccount(accountId, "whatsapp.connected", { phoneNumber: maskPhoneNumber(phoneNumber), mode: currentMode });
          settleInitialized();
          await this.syncGroups(accountId);
        }
        if (connection === "close") {
          this.stopHeartbeat(accountId);
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          const loggedOut = code === DisconnectReason.loggedOut;
          const intentional = manuallyDisconnected.delete(accountId);
          const replacedByNewSocket = Boolean(sockets.get(accountId) && sockets.get(accountId) !== socket);
          const closeError = lastDisconnect?.error instanceof Error ? lastDisconnect.error : new Error("WhatsApp socket closed before initialization.");
          if (sockets.get(accountId) === socket) sockets.delete(accountId);
          logger.warn("whatsapp.connection.closed", { accountId, code, loggedOut, intentional, mode: currentMode });
          if (intentional) return;
          if (currentMode === "PAIR_QR") {
            if (replacedByNewSocket) return;
            const pendingQr = await prisma.whatsAppAccount.findUnique({
              where: { id: accountId },
              select: { qrCode: true, qrExpiresAt: true },
            });
            if (pendingQr?.qrCode && pendingQr.qrExpiresAt && pendingQr.qrExpiresAt > new Date()) {
              await prisma.whatsAppAccount.updateMany({
                where: { id: accountId, archivedAt: null },
                data: { status: "QR_READY", lastError: null },
              });
              if (!initializedSettled) settleInitialized();
              logger.warn("whatsapp.qr.connection_closed_after_ready", { accountId, code });
              return;
            }
            const attempts = qrTransientRetries.get(accountId) ?? 0;
            if (!loggedOut && attempts < QR_TRANSIENT_RETRY_LIMIT) {
              const nextAttempt = attempts + 1;
              qrTransientRetries.set(accountId, nextAttempt);
              await prisma.whatsAppAccount.updateMany({
                where: { id: accountId, archivedAt: null },
                data: { status: "PENDING_QR", qrCode: null, qrExpiresAt: null, lastError: null, recoveryLevel: Math.max(1, nextAttempt), healthScore: 25 },
              });
              logger.warn("whatsapp.qr.transient_close_retry_scheduled", { accountId, code, attempt: nextAttempt, maxAttempts: QR_TRANSIENT_RETRY_LIMIT });
              await auditAccount(accountId, "whatsapp.qr.retry_scheduled", { code, attempt: nextAttempt }).catch((error) =>
                logger.warn("whatsapp.qr.retry_audit_failed", { accountId, reason: errorMessage(error) }),
              );
              setTimeout(() => {
                void this.startSession(accountId, "PAIR_QR")
                  .then(({ initialized: nextInitialized }) => nextInitialized)
                  .catch((error) => logger.error("whatsapp.qr.retry_failed", error, { accountId, attempt: nextAttempt }));
              }, Math.min(1_000 * nextAttempt, 5_000));
              if (!initializedSettled) settleInitialized();
              return;
            }
            qrTransientRetries.delete(accountId);
            await clearWhatsAppSession(accountId);
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "FAILED", qrCode: null, qrExpiresAt: null, lastError: "WHATSAPP_QR_FAILED", recoveryLevel: 4, healthScore: 0 },
            });
            await auditAccount(accountId, "whatsapp.qr.failed", { code });
            if (!initializedSettled) settleInitialized(closeError);
            return;
          }
          if (!initializedSettled) settleInitialized(closeError);
          if (currentMode === "PAIR_PHONE") {
            if (replacedByNewSocket) {
              logger.warn("whatsapp.pairing.stale_socket_close_ignored", { accountId, code });
              return;
            }
            if (code === DisconnectReason.restartRequired) {
              await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "CONNECTING", pairingCode: null, pairingCodeExpiresAt: null, lastError: null } });
              setTimeout(() => {
                void this.startSession(accountId, "PAIR_PHONE")
                  .then(({ initialized: nextInitialized }) => nextInitialized)
                  .catch((error) => logger.error("whatsapp.pairing.restart_failed", error, { accountId }));
              }, 1_000);
              return;
            }
            const reason = lastDisconnect?.error instanceof Error ? lastDisconnect.error.message : "WhatsApp pairing connection closed";
            if (!state.creds.registered && await this.preserveActivePairingCode(accountId, reason, code)) return;
            logger.error("whatsapp.pairing.connection_closed", lastDisconnect?.error, { accountId, code });
            await clearWhatsAppSession(accountId);
            await prisma.whatsAppAccount.updateMany({ where: { id: accountId, archivedAt: null }, data: { status: "FAILED", pairingCode: null, pairingCodeExpiresAt: null, lastError: pairingUserMessage(lastDisconnect?.error) } });
            await auditAccount(accountId, "whatsapp.pairing.failed", { reason, code });
            return;
          }
          const updated = await prisma.whatsAppAccount.updateMany({
            where: { id: accountId, archivedAt: null },
            data: {
              status: loggedOut ? "RECONNECT_REQUIRED" : state.creds.registered ? "DISCONNECTED" : "RECONNECT_REQUIRED",
              lastDisconnectedAt: new Date(),
              recoveryLevel: loggedOut ? 5 : state.creds.registered ? 1 : 4,
              healthScore: loggedOut ? 0 : state.creds.registered ? 55 : 20,
              lastError: loggedOut ? "WHATSAPP_LOGGED_OUT" : state.creds.registered ? "WHATSAPP_TRANSIENT_DISCONNECT" : "WHATSAPP_CREDENTIALS_MISSING",
            },
          });
          if (loggedOut) {
            await clearWhatsAppSession(accountId);
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_LOGGED_OUT", recoveryLevel: 5, healthScore: 0 },
            });
          } else if (state.creds.registered) {
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "DISCONNECTED", lastError: "WHATSAPP_TRANSIENT_DISCONNECT", recoveryLevel: 1 },
            });
          } else {
            await prisma.whatsAppAccount.updateMany({
              where: { id: accountId, archivedAt: null },
              data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING", recoveryLevel: 5, healthScore: 0 },
            });
          }
          await auditAccount(accountId, loggedOut ? "whatsapp.logged_out" : "whatsapp.disconnected", { code, loggedOut, mode: currentMode, recoverable: state.creds.registered && !loggedOut });
          if (updated.count && !loggedOut && state.creds.registered) {
            this.scheduleReconnect(accountId, `connection_close:${code ?? "unknown"}`);
          }
        }
      } catch (error) {
        if (sockets.get(accountId) === socket) sockets.delete(accountId);
        const modeAtFailure = sessionModes.get(accountId) || mode;
          const restorable = await hasRestorableWhatsAppCredentials(accountId).catch(() => false);
          if (modeAtFailure === "PAIR_QR") {
            const pendingQr = await prisma.whatsAppAccount.findUnique({
              where: { id: accountId },
              select: { qrCode: true, qrExpiresAt: true },
            });
            if (pendingQr?.qrCode && pendingQr.qrExpiresAt && pendingQr.qrExpiresAt > new Date()) {
              await prisma.whatsAppAccount.updateMany({
                where: { id: accountId, archivedAt: null },
                data: { status: "QR_READY", lastError: null },
              });
              logger.warn("whatsapp.qr.error_after_ready_ignored", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
              if (!initializedSettled) settleInitialized();
              return;
            }
          }
          if (modeAtFailure === "PAIR_PHONE" && await this.preserveActivePairingCode(accountId, errorMessage(error))) {
            logger.warn("whatsapp.pairing.error_after_code_ignored", { accountId, mode: modeAtFailure, reason: errorMessage(error) });
            if (!initializedSettled) settleInitialized();
            return;
          }
          await prisma.whatsAppAccount.updateMany({
          where: { id: accountId, archivedAt: null, status: { in: ["PENDING_QR", "QR_READY", "PENDING_PAIRING", "PAIRING_CODE_READY", "CONNECTING"] } },
          data: {
            status: modeAtFailure === "PAIR_QR" || modeAtFailure === "PAIR_PHONE" ? "FAILED" : restorable ? "DISCONNECTED" : "RECONNECT_REQUIRED",
            lastError: modeAtFailure === "PAIR_PHONE" ? pairingUserMessage(error) : restorable ? "WHATSAPP_TRANSIENT_DISCONNECT" : "WHATSAPP_CREDENTIALS_MISSING",
          },
        });
        logger.error("whatsapp.connection.failed", error, { accountId, mode: modeAtFailure, reason: errorMessage(error) });
        logger.error("whatsapp.connection.update_failed", error, { accountId, mode: modeAtFailure });
        if (!initializedSettled) settleInitialized(error);
      }
    });
    return { socket, registered: state.creds.registered, initialized };
  }

  async createSession(accountId: string): Promise<SessionResult> {
    const existingSocket = sockets.get(accountId);
    if (existingSocket?.user) return { sessionId: accountId, qrCode: await this.getQr(accountId) };
    if (existingSocket) await this.stopSocket(accountId, "Replace stale WhatsApp socket");
    const { initialized } = await this.startSession(accountId, "PAIR_QR");
    void initialized.catch((error) => logger.warn("whatsapp.qr.initialization_deferred_failed", { accountId, reason: errorMessage(error) }));
    return { sessionId: accountId, qrCode: null };
  }

  async createFreshQrSession(accountId: string): Promise<SessionResult> {
    qrTransientRetries.delete(accountId);
    await this.clearTemporaryAuth(accountId);
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: {
        status: "PENDING_QR",
        qrCode: null,
        qrExpiresAt: null,
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastError: null,
      },
    });
    await prisma.whatsAppSession.updateMany({
      where: { accountId },
      data: { status: "PENDING_QR", qrCode: null, expiresAt: null },
    });
    await auditAccount(accountId, "whatsapp.qr.fresh_session_requested");
    return this.createSession(accountId);
  }

  async getQr(accountId: string) {
    return (await prisma.whatsAppSession.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } }))?.qrCode ?? null;
  }

  async disconnect(accountId: string) {
    await this.stopSocket(accountId, "Manual disconnect");
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "DISCONNECTED", lastDisconnectedAt: new Date(), lastError: null } });
  }

  async reconnect(accountId: string) {
    const hasCredentials = await hasRestorableWhatsAppCredentials(accountId);
    if (hasCredentials) {
      await this.stopSocket(accountId, "Recover existing WhatsApp session");
      await restoreWhatsAppSessionFromDatabase(accountId);
      await prisma.whatsAppAccount.updateMany({
        where: { id: accountId, archivedAt: null },
        data: { status: "CONNECTING", qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null, lastError: null, recoveryLevel: 2 },
      });
      await auditAccount(accountId, "whatsapp.session.recovery_requested");
      const { initialized } = await this.startSession(accountId, "RECONNECT");
      await initialized;
      return;
    }
    await prisma.whatsAppAccount.updateMany({
      where: { id: accountId, archivedAt: null },
      data: { status: "RECONNECT_REQUIRED", lastError: "WHATSAPP_CREDENTIALS_MISSING", recoveryLevel: 5, healthScore: 0 },
    });
    await auditAccount(accountId, "whatsapp.session.auth_required");
  }

  async syncGroups(accountId: string): Promise<GroupResult[]> {
    const startedAt = Date.now();
    const socket = await this.ensureConnectedSocket(accountId);
    const metadata = await socket.groupFetchAllParticipating();
    const groups = Object.values(metadata).map((group) => ({ externalId: group.id, name: group.subject, description: group.desc, participantCount: group.participants.length, canSend: !group.announce }));
    const account = await prisma.whatsAppAccount.findUniqueOrThrow({
      where: { id: accountId },
      include: { company: { select: { ownerId: true } } },
    });
    const ownerUserId = account.userId ?? account.company.ownerId;
    if (!ownerUserId) throw new Error("WHATSAPP_ACCOUNT_OWNER_MISSING");
    if (!account.userId) {
      await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { userId: ownerUserId } });
    }
    const syncedAt = new Date();
    const groupJids = groups.map((group) => group.externalId);
    const mutations = groups.map((group) => prisma.whatsAppGroup.upsert({
      where: { accountId_externalGroupId: { accountId, externalGroupId: group.externalId } },
      update: {
        userId: ownerUserId,
        companyId: account.companyId,
        accountId,
        name: group.name,
        description: group.description,
        participantCount: group.participantCount,
        canSend: group.canSend,
        isArchived: false,
        lastSyncedAt: syncedAt,
      },
      create: {
        userId: ownerUserId,
        companyId: account.companyId,
        accountId,
        externalGroupId: group.externalId,
        name: group.name,
        description: group.description,
        participantCount: group.participantCount,
        canSend: group.canSend,
        lastSyncedAt: syncedAt,
      },
    }));
    const results = await prisma.$transaction([
      prisma.whatsAppGroup.updateMany({
        where: {
          accountId,
          OR: [
            { companyId: { not: account.companyId } },
            { userId: null },
            { userId: { not: ownerUserId } },
          ],
        },
        data: { userId: ownerUserId, companyId: account.companyId },
      }),
      ...mutations,
      prisma.whatsAppGroup.updateMany({
        where: { accountId, externalGroupId: { notIn: groupJids }, isArchived: false },
        data: { userId: ownerUserId, companyId: account.companyId, isArchived: true, lastSyncedAt: syncedAt },
      }),
    ]);
    const ownershipRepaired = results[0];
    const deactivated = results.at(-1);
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: {
        lastSyncedAt: syncedAt,
        lastGroupSyncAt: syncedAt,
        healthScore: computeWhatsAppHealthScore({ status: "CONNECTED", lastHeartbeatAt: syncedAt, lastPongAt: syncedAt, lastSyncedAt: syncedAt, groupCount: groups.length, hasSessionSnapshot: true }),
      },
    });
    await backupWhatsAppSessionToDatabase(accountId, "group.sync").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId }));
    logger.info("GROUP_SYNC", {
      correlationId: `sync-${accountId}-${syncedAt.getTime()}`,
      userId: ownerUserId,
      companyId: account.companyId,
      whatsappAccountId: accountId,
      phoneNumber: account.phoneNumber ?? undefined,
      groupsFetchedCount: groups.length,
      groupsUpsertedCount: groups.length,
      groupsOwnershipRepairedCount: typeof ownershipRepaired === "object" && ownershipRepaired && "count" in ownershipRepaired ? ownershipRepaired.count : 0,
      groupsDeactivatedCount: typeof deactivated === "object" && deactivated && "count" in deactivated ? deactivated.count : 0,
      duration: Date.now() - startedAt,
      source: "baileys-provider",
    });
    await auditAccount(accountId, "whatsapp.groups.synced", { count: groups.length });
    return groups;
  }

  async sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    const hasCredentials = await hasRestorableWhatsAppCredentials(input.accountId);
    if (!hasCredentials || account.lastError === "WHATSAPP_LOGGED_OUT" || account.lastError === "WHATSAPP_CREDENTIALS_MISSING") {
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "RECONNECT_REQUIRED", lastError: hasCredentials ? "WHATSAPP_LOGGED_OUT" : "WHATSAPP_CREDENTIALS_MISSING", recoveryLevel: 5, healthScore: 0 },
      });
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
    await restoreWhatsAppSessionFromDatabase(input.accountId);
    if (["RECONNECT_REQUIRED", "DISCONNECTED", "FAILED", "ERROR"].includes(account.status)) {
      await prisma.whatsAppAccount.updateMany({ where: { id: input.accountId, archivedAt: null }, data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 } });
    }
    const socket = await this.ensureConnectedSocket(input.accountId);
    const logContext = {
      accountId: input.accountId,
      groupExternalId: input.groupExternalId,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    };
    logger.info("message.baileys.send.attempt", logContext);
    let result: Awaited<ReturnType<typeof socket.sendMessage>>;
    try {
      result = await socket.sendMessage(input.groupExternalId, { text: input.content });
    } catch (error) {
      logger.error("message.baileys.send.failed", error, logContext);
      throw error;
    }
    if (!result?.key.id) {
      const error = new Error("WhatsApp did not return a message id");
      logger.error("message.baileys.send.failed", error, logContext);
      throw error;
    }
    await prisma.whatsAppAccount.updateMany({
      where: { id: input.accountId, archivedAt: null },
      data: { status: "CONNECTED", lastError: null, lastMessageAt: new Date(), lastPongAt: new Date(), healthScore: 95, recoveryLevel: 0 },
    });
    await backupWhatsAppSessionToDatabase(input.accountId, "message.sent").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId: input.accountId }));
    logger.info("MESSAGE_SENT", { ...logContext, externalMessageId: result.key.id });
    logger.info("message.baileys.send.succeeded", { ...logContext, externalMessageId: result.key.id });
    return { externalMessageId: result.key.id, messageKey: result.key };
  }

  async deleteGroupMessage(input: DeleteGroupMessageInput): Promise<DeleteResult> {
    const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.archivedAt) throw new Error("WHATSAPP_ACCOUNT_NOT_FOUND");
    if (!input.groupExternalId) throw new Error("Missing external group ID.");
    if (!input.messageKey?.id) throw new Error("WHATSAPP_MESSAGE_KEY_MISSING");
    const hasCredentials = await hasRestorableWhatsAppCredentials(input.accountId);
    if (!hasCredentials || account.lastError === "WHATSAPP_LOGGED_OUT" || account.lastError === "WHATSAPP_CREDENTIALS_MISSING") {
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "RECONNECT_REQUIRED", lastError: hasCredentials ? "WHATSAPP_LOGGED_OUT" : "WHATSAPP_CREDENTIALS_MISSING", recoveryLevel: 5, healthScore: 0 },
      });
      throw new Error("WHATSAPP_RECONNECT_REQUIRED");
    }
    await restoreWhatsAppSessionFromDatabase(input.accountId);
    if (["RECONNECT_REQUIRED", "DISCONNECTED", "FAILED", "ERROR"].includes(account.status)) {
      await prisma.whatsAppAccount.updateMany({ where: { id: input.accountId, archivedAt: null }, data: { status: "CONNECTING", lastError: null, recoveryLevel: 2 } });
    }
    const socket = await this.ensureConnectedSocket(input.accountId);
    const deleteKey: WAMessageKey = {
      ...input.messageKey,
      id: input.messageKey.id,
      remoteJid: input.messageKey.remoteJid ?? input.groupExternalId,
      fromMe: input.messageKey.fromMe ?? true,
    };
    const logContext = {
      accountId: input.accountId,
      groupExternalId: input.groupExternalId,
      externalMessageId: deleteKey.id,
      correlationId: input.correlationId,
      campaignId: input.campaignId,
      recipientId: input.recipientId,
    };
    logger.info("message.baileys.delete.attempt", logContext);
    try {
      const result = await socket.sendMessage(input.groupExternalId, { delete: deleteKey });
      await prisma.whatsAppAccount.updateMany({
        where: { id: input.accountId, archivedAt: null },
        data: { status: "CONNECTED", lastError: null, lastPongAt: new Date(), healthScore: 95, recoveryLevel: 0 },
      });
      await backupWhatsAppSessionToDatabase(input.accountId, "message.deleted").catch((error) => logger.error("whatsapp.session.backup_failed", error, { accountId: input.accountId }));
      logger.info("message.baileys.delete.succeeded", { ...logContext, deleteMessageId: result?.key?.id });
      return { ok: true, externalMessageId: result?.key?.id ?? null };
    } catch (error) {
      logger.error("message.baileys.delete.failed", error, logContext);
      throw error;
    }
  }
}
