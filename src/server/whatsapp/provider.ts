import type { WAMessageKey } from "@whiskeysockets/baileys";

export type ProviderGroup = { externalId: string; name: string; description?: string; participantCount: number; canSend: boolean };
export type SessionResult = { sessionId: string; qrCode?: string | null; expiresAt?:Date };
export type GroupResult = ProviderGroup;
export type SendGroupMessageInput = { accountId: string; groupExternalId: string; content: string; correlationId?: string; campaignId?: string; recipientId?: string };
export type DeleteGroupMessageInput = { accountId: string; groupExternalId: string; messageKey: WAMessageKey; correlationId?: string; campaignId?: string; recipientId?: string };
export type SendContactMessageInput = { accountId: string; contactExternalId: string; content: string; correlationId?: string; campaignId?: string; recipientId?: string };
export type DeleteContactMessageInput = { accountId: string; contactExternalId: string; messageKey: WAMessageKey; correlationId?: string; campaignId?: string; recipientId?: string };
export type SendResult = { externalMessageId: string; messageKey: WAMessageKey };
export type DeleteResult = { ok: true; externalMessageId?: string | null };
export type RequestPairingCodeOptions = { preserveRetryCounter?: boolean };
export interface WhatsAppProvider {
  createSession(accountId: string): Promise<SessionResult>;
  createFreshQrSession(accountId: string): Promise<SessionResult>;
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
