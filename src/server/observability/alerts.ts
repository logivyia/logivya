import { Prisma } from "@prisma/client";
import { canonicalAuditAction, sanitizeLogMetadata } from "@logivya/logging";
import { prisma } from "@/server/db";
import { retentionDeadline } from "@/server/observability/privacy";
import { ensureIncidentForAlert } from "@/server/monitoring/incidents";

export type OperationalAlertInput = {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  service: string;
  message: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  windowMinutes?: number;
};

export function operationalAlertDedupeKey(input: Pick<OperationalAlertInput, "service" | "type"> & { environment: string; windowMinutes?: number; now?: number }) {
  const windowMinutes = Math.max(1, Math.min(input.windowMinutes ?? 15, 1_440));
  const window = Math.floor((input.now ?? Date.now()) / (windowMinutes * 60_000));
  return `${input.environment}:${input.service}:${canonicalAuditAction(input.type)}:${window}`;
}

export async function raiseOperationalAlert(input: OperationalAlertInput) {
  const environment = process.env.LOG_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const type = canonicalAuditAction(input.type);
  const dedupeKey = operationalAlertDedupeKey({ environment, service: input.service, type, windowMinutes: input.windowMinutes });
  const safe = sanitizeLogMetadata({ message: input.message, metadata: input.metadata });
  const now = new Date();
  const alert = await prisma.$transaction(async (tx) => {
    await tx.operationalAlert.updateMany({
      where: {
        environment,
        service: input.service,
        type,
        dedupeKey: { not: dedupeKey },
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      data: { status: "RESOLVED", resolvedAt: now },
    });
    const current = await tx.operationalAlert.findUnique({ where: { dedupeKey } });
    const reopen = current && ["RESOLVED", "DISMISSED"].includes(current.status);
    return tx.operationalAlert.upsert({
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
        lastSeenAt: now,
        severity: input.severity,
        correlationId: input.correlationId,
        metadata: (safe.metadata ?? {}) as Prisma.InputJsonValue,
        ...(reopen
          ? {
              status: "OPEN",
              resolvedAt: null,
              acknowledgedAt: null,
              acknowledgedByUserId: null,
            }
          : {}),
      },
    });
  });
  await ensureIncidentForAlert(alert).catch(() => undefined);
  return alert;
}
