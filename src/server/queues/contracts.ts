export type SendRecipientJob = {
  companyId: string;
  campaignId: string;
  recipientId: string;
  channelAccountId: string;
};
export type QueueJob<TPayload> = {
  id: string;
  companyId: string;
  correlationId: string;
  payload: TPayload;
  createdAt: string;
};
export const QUEUES = {
  campaign: "logivya-campaign",
  message: "logivya-message",
  sync: "logivya-sync",
  notification: "logivya-notification",
  billing: "logivya-billing",
  analytics: "logivya-analytics",
  webhook: "logivya-webhook",
  deadLetter: "logivya-dead-letter",
} as const;
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: 1_000,
  removeOnFail: 10_000,
} as const;
