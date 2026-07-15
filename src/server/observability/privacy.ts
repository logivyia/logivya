import { createHmac } from "node:crypto";
import { maskIpAddress, sanitizeLogMetadata, summarizeUserAgent } from "@logivya/logging";

function hashingKey() {
  return process.env.OBSERVABILITY_HASH_KEY || process.env.SESSION_ENCRYPTION_KEY || process.env.AUTH_SECRET;
}

export function keyedIdentifierHash(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  const key = hashingKey();
  if (!normalized || !key) return undefined;
  return createHmac("sha256", key).update(normalized).digest("base64url").slice(0, 32);
}

export function requestNetworkSummary(request?: Request) {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddressMasked: maskIpAddress(forwarded),
    userAgentSummary: summarizeUserAgent(request?.headers.get("user-agent")),
  };
}

export function safeState(value: Record<string, unknown> | null | undefined) {
  return sanitizeLogMetadata(value);
}

export function retentionDeadline(category: "security" | "alert") {
  const key = category === "security" ? "SECURITY_EVENT_RETENTION_DAYS" : "OPERATIONAL_ALERT_RETENTION_DAYS";
  const raw = process.env[key];
  if (!raw) return undefined;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3_650) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60_000);
}
