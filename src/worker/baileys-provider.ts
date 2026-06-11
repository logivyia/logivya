import { mkdir } from "node:fs/promises";
import path from "node:path";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WASocket } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import type { GroupResult, SendGroupMessageInput, SendResult, SessionResult, WhatsAppProvider } from "@/server/whatsapp/provider";

const sockets = new Map<string, WASocket>();
const sessionRoot = process.env.WHATSAPP_SESSION_DIR || path.join(process.cwd(), "sessions");

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  async requestPairingCode(accountId: string, phoneNumber: string): Promise<string> {
    void accountId;
    void phoneNumber;
    throw new Error("PAIRING_CODE_UNSUPPORTED");
  }
  async createSession(accountId: string): Promise<SessionResult> {
    await mkdir(sessionRoot, { recursive: true });
    const directory = path.join(sessionRoot, accountId);
    // Baileys uses this name for its auth-state factory; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const { version } = await fetchLatestBaileysVersion();
    const socket = makeWASocket({ auth: state, version, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false });
    sockets.set(accountId, socket);
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "CONNECTING" } });
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        const qrCode = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
        await prisma.whatsAppSession.upsert({
          where: { id: accountId },
          update: { qrCode, status: "PENDING_QR", expiresAt: new Date(Date.now() + 60000) },
          create: { id: accountId, accountId, qrCode, status: "PENDING_QR", expiresAt: new Date(Date.now() + 60000) },
        });
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "PENDING_QR" } });
      }
      if (connection === "open") {
        const phoneNumber = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0];
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "CONNECTED", phoneNumber, displayName: socket.user?.name, lastConnectedAt: new Date() } });
        await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTED", qrCode: null, expiresAt: null } });
        await this.syncGroups(accountId);
      }
      if (connection === "close") {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: loggedOut ? "RECONNECT_REQUIRED" : "DISCONNECTED", lastDisconnectedAt: new Date() } });
        if (!loggedOut) setTimeout(() => void this.reconnect(accountId), 5000);
      }
    });
    return { sessionId: accountId, qrCode: null };
  }
  async getQr(accountId: string) {
    return (await prisma.whatsAppSession.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } }))?.qrCode ?? null;
  }
  async disconnect(accountId: string) {
    const socket = sockets.get(accountId);
    if (socket) await socket.logout();
    sockets.delete(accountId);
  }
  async reconnect(accountId: string) { await this.createSession(accountId); }
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
    return groups;
  }
  async sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult> {
    const socket = sockets.get(input.accountId);
    if (!socket) throw new Error("WhatsApp session is not active");
    const result = await socket.sendMessage(input.groupExternalId, { text: input.content });
    if (!result?.key.id) throw new Error("WhatsApp did not return a message id");
    return { externalMessageId: result.key.id };
  }
}
