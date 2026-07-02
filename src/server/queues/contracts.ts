export type SendRecipientJob = {
  companyId: string;
  campaignId: string;
  recipientId: string;
  correlationId: string;
  source: "web" | "mobile" | "recurring" | "retry" | "recoverable-retry";
  recoveryRetry?: boolean;
};
export type DeleteForEveryoneJob = {
  companyId: string;
  campaignId: string;
  recipientId: string;
  whatsappAccountId: string;
  groupJid: string;
  messageKeyJson: unknown;
  userId: string;
  correlationId: string;
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
export const WHATSAPP_MESSAGE_JOB_OPTIONS = {
  attempts: Number(process.env.WHATSAPP_MESSAGE_ATTEMPTS || 8),
  backoff: { type: "exponential", delay: Number(process.env.WHATSAPP_MESSAGE_RETRY_DELAY_MS || 5_000) },
  removeOnComplete: { age: 3_600, count: 250 },
  removeOnFail: { age: 86_400, count: 500 },
} as const;
export const WHATSAPP_DELETE_JOB_OPTIONS = {
  attempts: Number(process.env.WHATSAPP_DELETE_ATTEMPTS || 5),
  backoff: { type: "exponential", delay: Number(process.env.WHATSAPP_DELETE_RETRY_DELAY_MS || 10_000) },
  removeOnComplete: { age: 3_600, count: 250 },
  removeOnFail: { age: 86_400, count: 500 },
} as const;
