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
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 250 },
  removeOnFail: { age: 86_400, count: 500 },
} as const;
export const SCHEDULED_MESSAGE_JOB_OPTIONS = {
  attempts: Number(process.env.SCHEDULED_MESSAGE_ATTEMPTS || 6),
  backoff: { type: "fixed", delay: Number(process.env.SCHEDULED_MESSAGE_RETRY_DELAY_MS || 10 * 60_000) },
  removeOnComplete: { age: 3_600, count: 250 },
  removeOnFail: { age: 86_400, count: 500 },
} as const;
