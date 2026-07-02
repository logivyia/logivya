import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

const MESSAGE_CORRELATION_PATTERN = /^MSG-[A-F0-9]{8}$/;

function jsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export function createMessageCorrelationId() {
  return `MSG-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function readCampaignMetadata(value: unknown) {
  return jsonObject(value);
}

export function readCampaignCorrelationId(value: unknown) {
  const correlationId = readCampaignMetadata(value).correlationId;
  return typeof correlationId === "string" && MESSAGE_CORRELATION_PATTERN.test(correlationId) ? correlationId : undefined;
}

export function withCampaignMetadata(value: unknown, metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries({ ...readCampaignMetadata(value), ...metadata }).filter(([, entryValue]) => entryValue !== undefined),
  ) as Prisma.InputJsonObject;
}
