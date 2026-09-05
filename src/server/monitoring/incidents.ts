import { createHash } from "node:crypto";
import {
  Prisma,
  type IncidentLog,
  type SecurityEventSeverity,
} from "@prisma/client";

import { sanitizeLogMetadata } from "@logivya/logging";
import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";
import type {
  ServiceHealth,
  SystemHealthSnapshot,
} from "@/server/monitoring/contracts";
import { createNotification } from "@/server/notifications/service";

export const INCIDENT_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "MITIGATED",
  "RESOLVED",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

type IncidentMetadata = {
  service?: string;
  source?: string;
  alertId?: string;
  alertDedupeKey?: string;
  safeErrorCode?: string | null;
  runbook?: string | null;
  environment?: string;
  release?: string | null;
  acknowledgedAt?: string;
  acknowledgedByUserId?: string;
  investigationNote?: string;
  resolutionNote?: string;
  resolvedByUserId?: string;
  lastDetectedAt?: string;
  recoveryCount?: number;
  recoveryFirstSeenAt?: string | null;
  timeline?: Array<{
    at: string;
    action: string;
    actorUserId?: string;
    note?: string;
  }>;
};

function record(value: Prisma.JsonValue | null): IncidentMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as IncidentMetadata)
    : {};
}

function incidentId(key: string) {
  return `inc_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function severityForService(item: ServiceHealth): SecurityEventSeverity {
  if (item.state === "UNAVAILABLE" && item.tier === 0) return "CRITICAL";
  if (item.state === "UNAVAILABLE" || item.tier === 0) return "HIGH";
  return "MEDIUM";
}

function appendTimeline(
  metadata: IncidentMetadata,
  entry: NonNullable<IncidentMetadata["timeline"]>[number],
) {
  return [...(metadata.timeline ?? []), entry].slice(-100);
}

async function notifyIncidentOpened(input: {
  incidentId: string;
  title: string;
  severity: string;
  service: string;
}) {
  const owner = await prisma.user.findUnique({
    where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
    select: {
      id: true,
      ownedCompanies: {
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
      memberships: {
        where: { status: "ACTIVE" },
        select: { companyId: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  const companyId =
    owner?.ownedCompanies[0]?.id ?? owner?.memberships[0]?.companyId;
  if (!owner || !companyId) return;
  await createNotification({
    companyId,
    userId: owner.id,
    type: "admin.operational_incident",
    title: `Operational incident: ${input.title}`.slice(0, 180),
    message: `${input.severity} incident detected for ${input.service}. Open System Health for details.`,
    payload: {
      incidentId: input.incidentId,
      severity: input.severity,
      service: input.service,
    },
  });
}

export async function ensureIncidentForAlert(alert: {
  id: string;
  dedupeKey: string;
  type: string;
  severity: string;
  service: string;
  environment: string;
  message: string;
  correlationId: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  if (!["HIGH", "CRITICAL"].includes(alert.severity)) return null;
  const id = incidentId(
    `alert:${alert.environment}:${alert.service}:${alert.type}`,
  );
  const current = await prisma.incidentLog.findUnique({ where: { id } });
  const existing = record(current?.metadata ?? null);
  const now = new Date();
  const safeMetadata = sanitizeLogMetadata({
    ...existing,
    service: alert.service,
    source: "operational-alert",
    alertId: alert.id,
    alertDedupeKey: alert.dedupeKey,
    environment: alert.environment,
    correlationId: alert.correlationId,
    alertMetadata: alert.metadata,
    lastDetectedAt: now.toISOString(),
    timeline: current?.resolvedAt
      ? appendTimeline(existing, { at: now.toISOString(), action: "REOPENED" })
      : existing.timeline,
  }) as Prisma.InputJsonValue;
  const severity = alert.severity as SecurityEventSeverity;
  const incident = await prisma.incidentLog.upsert({
    where: { id },
    create: {
      id,
      severity,
      title: alert.type.replaceAll("_", " ").slice(0, 180),
      description: alert.message.slice(0, 1_000),
      status: "OPEN",
      metadata: safeMetadata,
    },
    update: {
      severity,
      description: alert.message.slice(0, 1_000),
      status: current?.resolvedAt ? "OPEN" : (current?.status ?? "OPEN"),
      resolvedAt: null,
      metadata: safeMetadata,
    },
  });
  if (!current || current.resolvedAt)
    await notifyIncidentOpened({
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
      service: alert.service,
    }).catch(() => undefined);
  return incident;
}

async function ensureHealthIncident(
  item: ServiceHealth,
  snapshot: SystemHealthSnapshot,
) {
  const key = `health:${snapshot.environment}:${item.id}`;
  const id = incidentId(key);
  const current = await prisma.incidentLog.findUnique({ where: { id } });
  const existing = record(current?.metadata ?? null);
  const now = new Date();
  const metadata: IncidentMetadata = {
    ...existing,
    service: item.id,
    source: "health-reconciliation",
    alertDedupeKey: key,
    safeErrorCode: item.safeErrorCode,
    runbook: item.runbook,
    environment: snapshot.environment,
    release: item.release,
    lastDetectedAt: now.toISOString(),
    recoveryCount: 0,
    recoveryFirstSeenAt: null,
    timeline: current?.resolvedAt
      ? appendTimeline(existing, { at: now.toISOString(), action: "REOPENED" })
      : existing.timeline,
  };
  const severity = severityForService(item);
  const incident = await prisma.incidentLog.upsert({
    where: { id },
    create: {
      id,
      severity,
      title: `${item.name} ${item.state}`,
      description: item.summary.slice(0, 1_000),
      status: "OPEN",
      metadata: sanitizeLogMetadata(metadata) as Prisma.InputJsonValue,
    },
    update: {
      severity,
      title: `${item.name} ${item.state}`,
      description: item.summary.slice(0, 1_000),
      status: current?.resolvedAt ? "OPEN" : (current?.status ?? "OPEN"),
      resolvedAt: null,
      metadata: sanitizeLogMetadata(metadata) as Prisma.InputJsonValue,
    },
  });
  if (!current || current.resolvedAt)
    await notifyIncidentOpened({
      incidentId: incident.id,
      title: incident.title,
      severity: incident.severity,
      service: item.id,
    }).catch(() => undefined);
  const alertDedupeKey = `health:${snapshot.environment}:${item.id}`;
  await prisma.operationalAlert.upsert({
    where: { dedupeKey: alertDedupeKey },
    create: {
      dedupeKey: alertDedupeKey,
      type: `HEALTH_${item.id.toUpperCase()}_${item.state}`,
      severity,
      service: item.id,
      environment: snapshot.environment,
      message: item.summary.slice(0, 500),
      metadata: sanitizeLogMetadata({
        safeErrorCode: item.safeErrorCode,
        runbook: item.runbook,
        incidentId: incident.id,
      }) as Prisma.InputJsonValue,
    },
    update: {
      status: "OPEN",
      severity,
      type: `HEALTH_${item.id.toUpperCase()}_${item.state}`,
      message: item.summary.slice(0, 500),
      occurrenceCount: { increment: 1 },
      lastSeenAt: now,
      resolvedAt: null,
      metadata: sanitizeLogMetadata({
        safeErrorCode: item.safeErrorCode,
        runbook: item.runbook,
        incidentId: incident.id,
      }) as Prisma.InputJsonValue,
    },
  });
  return incident;
}

async function resolveRecoveredHealthIncident(
  item: ServiceHealth,
  snapshot: SystemHealthSnapshot,
) {
  const id = incidentId(`health:${snapshot.environment}:${item.id}`);
  const current = await prisma.incidentLog.findUnique({ where: { id } });
  if (!current || current.resolvedAt) return false;
  const now = new Date();
  const metadata = record(current.metadata);
  const requiredChecks = Math.max(
    2,
    Number(process.env.MONITORING_RECOVERY_CONSECUTIVE_CHECKS || 2),
  );
  const recoveryCount = (metadata.recoveryCount ?? 0) + 1;
  if (recoveryCount < requiredChecks) {
    await prisma.incidentLog.update({
      where: { id },
      data: {
        metadata: sanitizeLogMetadata({
          ...metadata,
          recoveryCount,
          recoveryFirstSeenAt:
            metadata.recoveryFirstSeenAt ?? now.toISOString(),
          timeline: appendTimeline(metadata, {
            at: now.toISOString(),
            action: "RECOVERY_OBSERVED",
          }),
        }) as Prisma.InputJsonValue,
      },
    });
    return false;
  }
  await prisma.$transaction([
    prisma.incidentLog.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        metadata: sanitizeLogMetadata({
          ...metadata,
          recoveryCount,
          resolutionNote:
            "Automatically resolved after consecutive health evidence recovered.",
          timeline: appendTimeline(metadata, {
            at: now.toISOString(),
            action: "AUTO_RESOLVED",
          }),
        }) as Prisma.InputJsonValue,
      },
    }),
    prisma.operationalAlert.updateMany({
      where: {
        dedupeKey: `health:${snapshot.environment}:${item.id}`,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      data: { status: "RESOLVED", resolvedAt: now },
    }),
  ]);
  return true;
}

export async function reconcileHealthIncidents(snapshot: SystemHealthSnapshot) {
  let openedOrUpdated = 0;
  let resolved = 0;
  for (const item of snapshot.services) {
    const actionable =
      item.state === "UNAVAILABLE" ||
      (item.tier === 0 && ["DEGRADED", "UNKNOWN"].includes(item.state));
    if (actionable) {
      await ensureHealthIncident(item, snapshot);
      openedOrUpdated += 1;
    } else if (
      item.state === "HEALTHY" &&
      (await resolveRecoveredHealthIncident(item, snapshot))
    ) {
      resolved += 1;
    }
  }
  return { openedOrUpdated, resolved };
}

const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"],
  ACKNOWLEDGED: ["INVESTIGATING", "MITIGATED", "RESOLVED"],
  INVESTIGATING: ["MITIGATED", "RESOLVED"],
  MITIGATED: ["INVESTIGATING", "RESOLVED"],
  RESOLVED: ["OPEN"],
};

export function canTransitionIncident(
  from: IncidentStatus,
  to: IncidentStatus,
) {
  return from === to || TRANSITIONS[from].includes(to);
}

export async function updateIncident(input: {
  incident: IncidentLog;
  status: IncidentStatus;
  note: string;
  actorUserId: string;
}) {
  const currentStatus = INCIDENT_STATUSES.includes(
    input.incident.status as IncidentStatus,
  )
    ? (input.incident.status as IncidentStatus)
    : "OPEN";
  if (!canTransitionIncident(currentStatus, input.status)) {
    throw new Error("INCIDENT_TRANSITION_INVALID");
  }
  const note = input.note.trim().slice(0, 1_000);
  if (note.length < 5) throw new Error("INCIDENT_NOTE_REQUIRED");
  const now = new Date();
  const metadata = record(input.incident.metadata);
  const nextMetadata: IncidentMetadata = {
    ...metadata,
    ...(input.status === "ACKNOWLEDGED"
      ? {
          acknowledgedAt: now.toISOString(),
          acknowledgedByUserId: input.actorUserId,
        }
      : {}),
    ...(input.status === "RESOLVED"
      ? { resolutionNote: note, resolvedByUserId: input.actorUserId }
      : { investigationNote: note }),
    timeline: appendTimeline(metadata, {
      at: now.toISOString(),
      action: input.status,
      actorUserId: input.actorUserId,
      note,
    }),
  };
  return prisma.$transaction(async (tx) => {
    const transition = await tx.incidentLog.updateMany({
      where: { id: input.incident.id, status: input.incident.status },
      data: {
        status: input.status,
        resolvedAt: input.status === "RESOLVED" ? now : null,
        metadata: sanitizeLogMetadata(nextMetadata) as Prisma.InputJsonValue,
      },
    });
    if (transition.count !== 1) {
      const current = await tx.incidentLog.findUnique({
        where: { id: input.incident.id },
      });
      if (current?.status === input.status) return current;
      throw new Error("INCIDENT_STATE_CHANGED");
    }
    if (metadata.alertId || metadata.alertDedupeKey) {
      await tx.operationalAlert.updateMany({
        where: metadata.alertId
          ? { id: metadata.alertId }
          : { dedupeKey: metadata.alertDedupeKey },
        data:
          input.status === "RESOLVED"
            ? { status: "RESOLVED", resolvedAt: now }
            : {
                status: "ACKNOWLEDGED",
                acknowledgedAt: now,
                acknowledgedByUserId: input.actorUserId,
              },
      });
    }
    return tx.incidentLog.findUniqueOrThrow({
      where: { id: input.incident.id },
    });
  });
}
