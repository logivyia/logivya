import type { WAMessageKey } from "@whiskeysockets/baileys";

export type ProviderGroup = { externalId: string; name: string; description?: string; participantCount: number; canSend: boolean };
export type SessionResult = { sessionId: string; qrCode?: string | null; expiresAt?:Date };
export type GroupResult = ProviderGroup;
export type WhatsAppOutboundAttachment = { mediaFileId: string; kind: "PHOTO" | "VIDEO" | "DOCUMENT"; fileName: string; mimeType: string; size: number; filePath: string };
export type SendGroupMessageInput = { accountId: string; groupExternalId: string; content: string; attachment?: WhatsAppOutboundAttachment; correlationId?: string; campaignId?: string; recipientId?: string };
export type DeleteGroupMessageInput = { accountId: string; groupExternalId: string; messageKey: WAMessageKey; correlationId?: string; campaignId?: string; recipientId?: string };
export type SendContactMessageInput = { accountId: string; contactExternalId: string; content: string; attachment?: WhatsAppOutboundAttachment; correlationId?: string; campaignId?: string; recipientId?: string };
export type DeleteContactMessageInput = { accountId: string; contactExternalId: string; messageKey: WAMessageKey; correlationId?: string; campaignId?: string; recipientId?: string };
export type WhatsAppSendAcknowledgement = "PENDING" | "SERVER_ACK" | "DELIVERED" | "READ";
export type SendResult = {
  externalMessageId: string;
  messageKey: WAMessageKey;
  acknowledgement: WhatsAppSendAcknowledgement;
  mediaUploadVerified: boolean;
};
export type DeleteResult = { ok: true; externalMessageId?: string | null };
export type RequestPairingCodeOptions = { preserveRetryCounter?: boolean };
export type CreateFreshQrSessionOptions = { correlationId?: string };
export interface WhatsAppProvider {
  createSession(accountId: string): Promise<SessionResult>;
  createFreshQrSession(accountId: string, options?: CreateFreshQrSessionOptions): Promise<SessionResult>;
  requestQrCode(accountId:string):Promise<{qr:string;expiresAt:Date}>;
  requestPairingCode(accountId: string, phoneNumber: string, options?: RequestPairingCodeOptions): Promise<{code:string;expiresAt:Date}>;
  refreshPairingCode(accountId: string, phoneNumber: string): Promise<{code:string;expiresAt:Date}>;
  getQr(accountId: string): Promise<string | null>;
  disconnect(accountId: string): Promise<void>;
  reconnect(accountId: string): Promise<void>;
  syncGroups(accountId: string): Promise<GroupResult[]>;
  syncContacts(accountId: string): Promise<{ count: number; deferred?: boolean }>;
  sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult>;
  sendContactMessage(input: SendContactMessageInput): Promise<SendResult>;
  deleteGroupMessage(input: DeleteGroupMessageInput): Promise<DeleteResult>;
  deleteContactMessage(input: DeleteContactMessageInput): Promise<DeleteResult>;
  getStatus(accountId:string):Promise<string>;
}
