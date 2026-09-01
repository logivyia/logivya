import type { WhatsAppIngestionStage } from "@prisma/client";

export const WHATSAPP_INGESTION_STAGES = [
  "WHATSAPP_INBOUND",
  "CONTENT_NORMALIZATION",
  "MEDIA_PROCESSING",
  "AI_CLASSIFICATION",
  "STRUCTURED_EXTRACTION",
  "LOCATION_NORMALIZATION",
  "PHONE_NORMALIZATION",
  "DUPLICATE_DETECTION",
  "LISTING_PUBLICATION",
  "DEMAND_MATCHING",
  "NOTIFICATION_DELIVERY",
] as const satisfies readonly WhatsAppIngestionStage[];

export const WHATSAPP_INGESTION_QUEUE_NAMES: Record<(typeof WHATSAPP_INGESTION_STAGES)[number], string> = {
  WHATSAPP_INBOUND: "whatsapp-inbound",
  CONTENT_NORMALIZATION: "content-normalization",
  MEDIA_PROCESSING: "media-processing",
  AI_CLASSIFICATION: "ai-classification",
  STRUCTURED_EXTRACTION: "structured-extraction",
  LOCATION_NORMALIZATION: "location-normalization",
  PHONE_NORMALIZATION: "phone-normalization",
  DUPLICATE_DETECTION: "duplicate-detection",
  LISTING_PUBLICATION: "listing-publication",
  DEMAND_MATCHING: "demand-matching",
  NOTIFICATION_DELIVERY: "notification-delivery",
};

export type WhatsAppIngestionJob = {
  inboundMessageId: string;
  accountId: string;
  groupId: string;
  stage: (typeof WHATSAPP_INGESTION_STAGES)[number];
  stageVersion: number;
  correlationId: string;
};

export const WHATSAPP_INGESTION_JOB_OPTIONS = {
  attempts: Math.min(12, Math.max(3, Number(process.env.WHATSAPP_INGESTION_ATTEMPTS || 6))),
  backoff: {
    type: "exponential" as const,
    delay: Math.min(60_000, Math.max(1_000, Number(process.env.WHATSAPP_INGESTION_RETRY_DELAY_MS || 5_000))),
  },
  removeOnComplete: { age: 86_400, count: 5_000 },
  removeOnFail: { age: 14 * 86_400, count: 10_000 },
} as const;

export function nextWhatsAppIngestionStage(stage: WhatsAppIngestionStage) {
  const index = WHATSAPP_INGESTION_STAGES.indexOf(stage as (typeof WHATSAPP_INGESTION_STAGES)[number]);
  return index >= 0 ? WHATSAPP_INGESTION_STAGES[index + 1] ?? "COMPLETED" : "COMPLETED";
}

export function ingestionJobId(input: Pick<WhatsAppIngestionJob, "inboundMessageId" | "stage" | "stageVersion">) {
  return `ing-${input.inboundMessageId}-${input.stage.toLowerCase().replace(/_/gu, "-")}-v${input.stageVersion}`;
}
