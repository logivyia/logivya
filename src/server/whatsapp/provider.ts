export type ProviderGroup = { externalId: string; name: string; description?: string; participantCount: number; canSend: boolean };
export interface WhatsAppProvider {
  createSession(accountId: string): Promise<{ sessionId: string; qrCode: string }>;
  disconnect(sessionId: string): Promise<void>;
  getGroups(sessionId: string): Promise<ProviderGroup[]>;
  sendGroupMessage(sessionId: string, groupExternalId: string, content: string): Promise<{ externalMessageId: string }>;
}
