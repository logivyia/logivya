export type ProviderGroup = { externalId: string; name: string; description?: string; participantCount: number; canSend: boolean };
export type SessionResult = { sessionId: string; qrCode?: string | null };
export type GroupResult = ProviderGroup;
export type SendGroupMessageInput = { accountId: string; groupExternalId: string; content: string };
export type SendResult = { externalMessageId: string };
export interface WhatsAppProvider {
  createSession(accountId: string): Promise<SessionResult>;
  requestPairingCode(accountId: string, phoneNumber: string): Promise<string>;
  getQr(accountId: string): Promise<string | null>;
  disconnect(accountId: string): Promise<void>;
  reconnect(accountId: string): Promise<void>;
  syncGroups(accountId: string): Promise<GroupResult[]>;
  sendGroupMessage(input: SendGroupMessageInput): Promise<SendResult>;
}
