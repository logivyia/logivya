export const WEBHOOK_EVENTS = [
  "campaign.created", "campaign.started", "campaign.completed", "campaign.failed",
  "account.connected", "account.disconnected", "account.reconnected",
  "subscription.created", "subscription.expired", "subscription.canceled",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];
export type WebhookEnvelope = {
  id: string;
  companyId: string;
  type: WebhookEventType;
  createdAt: string;
  data: Record<string, unknown>;
};
export interface WebhookSigner {
  sign(payload: string, encryptedSecret: string): Promise<string>;
  verify(payload: string, signature: string, encryptedSecret: string): Promise<boolean>;
}
