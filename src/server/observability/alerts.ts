import { Prisma } from "@prisma/client";
import { canonicalAuditAction, sanitizeLogMetadata } from "@logivya/logging";
import { prisma } from "@/server/db";
import { retentionDeadline } from "@/server/observability/privacy";

export type OperationalAlertInput = {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  service: string;
  message: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  windowMinutes?: number;
};

export async function raiseOperationalAlert(input: OperationalAlertInput) {
  const environment = process.env.LOG_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const windowMinutes = Math.max(1, Math.min(input.windowMinutes ?? 15, 1_440));
  const window = Math.floor(Date.now() / (windowMinutes * 60_000));
  const type = canonicalAuditAction(input.type);
  const dedupeKey = `${environment}:${input.service}:${type}:${window}`;
  const safe = sanitizeLogMetadata({ message: input.message, metadata: input.metadata });
  return prisma.operationalAlert.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      type,
      severity: input.severity,
      service: input.service,
      environment,
      message: String(safe.message ?? "Operational alert").slice(0, 500),
      correlationId: input.correlationId,
      metadata: (safe.metadata ?? {}) as Prisma.InputJsonValue,
      retainedUntil: retentionDeadline("alert"),
    },
    update: {
      occurrenceCount: { increment: 1 },
      lastSeenAt: new Date(),
      severity: input.severity,
      correlationId: input.correlationId,
      metadata: (safe.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
