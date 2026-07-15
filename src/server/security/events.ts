import { Prisma, type SecurityEventSeverity } from "@prisma/client";
import { canonicalAuditAction, sanitizeLogMetadata, sanitizeLogText, type SecurityEventStatus } from "@logivya/logging";
import { prisma } from "@/server/db";
import { requestObservabilityIds } from "@/server/observability/request-id";
import { requestNetworkSummary, retentionDeadline } from "@/server/observability/privacy";

export type SecurityEventInput = {
  request?: Request;
  companyId?: string | null;
  userId?: string | null;
  severity: SecurityEventSeverity;
  type: string;
  message: string;
  result?: string;
  status?: SecurityEventStatus;
  errorCode?: string;
  source?: string;
  requestId?: string;
  correlationId?: string;
  clientPlatform?: string;
  appVersion?: string;
  metadata?: Record<string, unknown>;
};

export async function recordSecurityEvent(input: SecurityEventInput) {
  const ids = input.request ? requestObservabilityIds(input.request) : undefined;
  const network = requestNetworkSummary(input.request);
  const safe = sanitizeLogMetadata({ message: input.message, metadata: input.metadata });
  return prisma.securityEvent.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      severity: input.severity,
      type: canonicalAuditAction(input.type),
      message: String(safe.message ?? "Security event recorded").slice(0, 500),
      result: input.result ?? "RECORDED",
      status: input.status ?? "OPEN",
      errorCode: input.errorCode ? sanitizeLogText(input.errorCode, 160) : undefined,
      source: input.source ? sanitizeLogText(input.source, 120) : undefined,
      requestId: input.requestId ?? ids?.requestId,
      correlationId: input.correlationId ?? ids?.correlationId,
      clientPlatform: sanitizeLogText(input.clientPlatform ?? input.request?.headers.get("x-client-platform") ?? "unknown", 80),
      appVersion: sanitizeLogText(input.appVersion ?? input.request?.headers.get("x-logivya-app-version") ?? "unknown", 80),
      metadata: (safe.metadata ?? {}) as Prisma.InputJsonValue,
      ipAddress: network.ipAddressMasked,
      ipAddressMasked: network.ipAddressMasked,
      userAgent: network.userAgentSummary,
      userAgentSummary: network.userAgentSummary,
      retainedUntil: retentionDeadline("security"),
    },
  });
}

export async function tryRecordSecurityEvent(input: SecurityEventInput) {
  try {
    return await recordSecurityEvent(input);
  } catch {
    return undefined;
  }
}
