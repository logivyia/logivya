import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

export type RetentionRunResult = {
  enforced: boolean;
  eligibleSecurityEvents: number;
  eligibleOperationalAlerts: number;
  deletedSecurityEvents: number;
  deletedOperationalAlerts: number;
};

export async function runObservabilityRetention(now = new Date()): Promise<RetentionRunResult> {
  const securityWhere: Prisma.SecurityEventWhereInput = { retainedUntil: { lte: now }, status: { in: ["RESOLVED", "DISMISSED"] } };
  const alertWhere: Prisma.OperationalAlertWhereInput = { retainedUntil: { lte: now }, status: { in: ["RESOLVED", "DISMISSED"] } };
  const [eligibleSecurityEvents, eligibleOperationalAlerts] = await Promise.all([
    prisma.securityEvent.count({ where: securityWhere }),
    prisma.operationalAlert.count({ where: alertWhere }),
  ]);

  if (process.env.LOG_RETENTION_ENFORCEMENT !== "true") {
    logger.info("observability.retention.dry_run", { eligibleSecurityEvents, eligibleOperationalAlerts });
    return { enforced: false, eligibleSecurityEvents, eligibleOperationalAlerts, deletedSecurityEvents: 0, deletedOperationalAlerts: 0 };
  }

  const [security, alerts] = await prisma.$transaction([
    prisma.securityEvent.deleteMany({ where: securityWhere }),
    prisma.operationalAlert.deleteMany({ where: alertWhere }),
  ]);
  logger.info("observability.retention.completed", {
    eligibleSecurityEvents,
    eligibleOperationalAlerts,
    deletedSecurityEvents: security.count,
    deletedOperationalAlerts: alerts.count,
  });
  return {
    enforced: true,
    eligibleSecurityEvents,
    eligibleOperationalAlerts,
    deletedSecurityEvents: security.count,
    deletedOperationalAlerts: alerts.count,
  };
}
