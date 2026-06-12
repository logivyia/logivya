import { mkdir } from "node:fs/promises";
import path from "node:path";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WASocket } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { prisma } from "@/server/db";
import type { GroupResult, SendGroupMessageInput, SendResult, SessionResult, WhatsAppProvider } from "@/server/whatsapp/provider";

const sockets = new Map<string, WASocket>();
const manuallyDisconnected = new Set<string>();
const sessionRoot = process.env.WHATSAPP_SESSION_DIR || path.join(process.cwd(), "sessions");

export class BaileysWhatsAppProvider implements WhatsAppProvider {
  async requestPairingCode(accountId: string, phoneNumber: string): Promise<{code:string;expiresAt:Date}> {
    if (!sockets.has(accountId)) await this.createSession(accountId);
    const socket = sockets.get(accountId);
    if (!socket) throw new Error("WhatsApp session is not active");
    const normalized = phoneNumber.replace(/\D/g, "");
    if (normalized.length < 7 || normalized.length > 15) throw new Error("Invalid phone number.");
    const code = await socket.requestPairingCode(normalized);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { status: "CONNECTING", phoneNumber: normalized, pairingCode: code, pairingCodeExpiresAt: expiresAt, lastError: null },
    });
    return { code, expiresAt };
  }
  async requestQrCode(accountId:string){if(!sockets.has(accountId))await this.createSession(accountId);for(let i=0;i<20;i++){const account=await prisma.whatsAppAccount.findUnique({where:{id:accountId}});if(account?.qrCode&&account.qrExpiresAt&&account.qrExpiresAt>new Date())return{qr:account.qrCode,expiresAt:account.qrExpiresAt};await new Promise(r=>setTimeout(r,500))}throw new Error("QR_GENERATION_TIMEOUT")}
  async getStatus(accountId:string){return(await prisma.whatsAppAccount.findUniqueOrThrow({where:{id:accountId}})).status}
  async createSession(accountId: string): Promise<SessionResult> {
    if (sockets.has(accountId)) return { sessionId: accountId, qrCode: await this.getQr(accountId) };
    manuallyDisconnected.delete(accountId);
    await mkdir(sessionRoot, { recursive: true });
    const directory = path.join(sessionRoot, accountId);
    // Baileys uses this name for its auth-state factory; it is not a React hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(directory);
    const { version } = await fetchLatestBaileysVersion();
    const socket = makeWASocket({ auth: state, version, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false });
    sockets.set(accountId, socket);
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "CONNECTING",lastError:null } });
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        const qrCode = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
        await prisma.whatsAppSession.upsert({
          where: { id: accountId },
          update: { qrCode, status: "QR_READY", expiresAt: new Date(Date.now() + 60000) },
          create: { id: accountId, accountId, qrCode, status: "QR_READY", expiresAt: new Date(Date.now() + 60000) },
        });
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "QR_READY",qrCode,qrExpiresAt:new Date(Date.now()+60000),lastError:null } });
      }
      if (connection === "open") {
        const phoneNumber = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0];
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "CONNECTED", phoneNumber, displayName: socket.user?.name, lastConnectedAt: new Date(),qrCode:null,qrExpiresAt:null,pairingCode:null,pairingCodeExpiresAt:null,lastError:null } });
        await prisma.whatsAppSession.updateMany({ where: { accountId }, data: { status: "CONNECTED", qrCode: null, expiresAt: null } });
        await this.syncGroups(accountId);
      }
      if (connection === "close") {
        const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const intentional = manuallyDisconnected.delete(accountId);
        if (sockets.get(accountId) === socket) sockets.delete(accountId);
        await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: loggedOut ? "RECONNECT_REQUIRED" : "DISCONNECTED", lastDisconnectedAt: new Date(),lastError:intentional?null:lastDisconnect?.error instanceof Error?lastDisconnect.error.message:"WhatsApp connection closed" } });
        if (!loggedOut && !intentional) setTimeout(() => void this.reconnect(accountId), 5000);
      }
    });
    return { sessionId: accountId, qrCode: null };
  }
  async getQr(accountId: string) {
    return (await prisma.whatsAppSession.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } }))?.qrCode ?? null;
  }
  async disconnect(accountId: string) {
    const socket = sockets.get(accountId);
    manuallyDisconnected.add(accountId);
    socket?.end(new Error("Manual disconnect"));
    sockets.delete(accountId);
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "DISCONNECTED", lastDisconnectedAt: new Date(), lastError: null } });
  }
  async reconnect(accountId: string) {
    const socket = sockets.get(accountId);
    if (socket) {
      manuallyDisconnected.add(accountId);
      socket.end(new Error("Reconnect requested"));
      sockets.delete(accountId);
    }
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
    return groups;
  }
  async sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult> {
    const account=await prisma.whatsAppAccount.findUnique({where:{id:input.accountId}});
    if(account?.status!=="CONNECTED")throw new Error("WhatsApp account is not connected.");
    if(!input.groupExternalId)throw new Error("Missing external group ID.");
    const socket = sockets.get(input.accountId);
    if (!socket) throw new Error("WhatsApp session is not active");
    const result = await socket.sendMessage(input.groupExternalId, { text: input.content });
    if (!result?.key.id) throw new Error("WhatsApp did not return a message id");
    return { externalMessageId: result.key.id };
  }
}
