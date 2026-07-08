import { AccountStatus } from "@prisma/client";

export type WhatsAppConnectionHealthInput = {
  status: AccountStatus;
  lastError?: string | null;
  lastHeartbeatAt?: Date | string | null;
  lastPongAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
  groupCount?: number | null;
  hasSessionSnapshot?: boolean;
};

function ageMs(value?: Date | string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

export function isHardWhatsAppDisconnect(lastError?: string | null) {
  return lastError === "WHATSAPP_LOGGED_OUT";
}

export function computeWhatsAppHealthScore(input: WhatsAppConnectionHealthInput) {
  if (isHardWhatsAppDisconnect(input.lastError)) return 0;
  let score = input.status === AccountStatus.CONNECTED ? 100 : input.status === AccountStatus.CONNECTING ? 76 : 62;

  if (ageMs(input.lastHeartbeatAt) > 90_000) score -= 20;
  if (ageMs(input.lastPongAt) > 120_000) score -= 15;
  if (ageMs(input.lastSyncedAt) > 6 * 60 * 60_000) score -= 8;
  if (!input.groupCount) score -= 15;
  if (!input.hasSessionSnapshot) score -= 25;
  if (input.status === AccountStatus.FAILED || input.status === AccountStatus.ERROR) score -= 30;

  return Math.max(0, Math.min(100, score));
}

export function healthLabel(score: number) {
  if (score >= 90) return "healthy";
  if (score >= 70) return "attention";
  if (score >= 50) return "risk";
  return "critical";
}
