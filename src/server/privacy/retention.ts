import "server-only";
import { prisma } from "@/server/db";
import { PRIVACY_RETENTION_POLICY_VERSION } from "@/server/privacy/catalog";
import { expirePrivacyExports } from "@/server/privacy/export";
import { raiseOperationalAlert } from "@/server/observability/alerts";

export async function runPrivacyRetention(input: { dryRun?: boolean; alertOverdue?: boolean; initiatedByUserId?: string }) {
  const dryRun = input.dryRun !== false;
  const run = await prisma.privacyRetentionRun.create({
    data: { policyVersion: PRIVACY_RETENTION_POLICY_VERSION, dryRun, initiatedByUserId: input.initiatedByUserId },
  });
  try {
    const activeHolds = await prisma.privacyLegalHold.count({ where: { status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } });
    const exports = await expirePrivacyExports({ dryRun });
    const overdue = await prisma.privacyDeletionJob.aggregate({
      where: { status: { in: ["QUEUED", "PROCESSING"] }, scheduledFor: { lt: new Date() } },
      _count: true, _min: { scheduledFor: true },
    });
    const counts = { activeLegalHolds: activeHolds, exports, destructiveDeletionJobsExecuted: 0,
      overdueDeletionJobs: overdue._count, oldestDeletionScheduledFor: overdue._min.scheduledFor?.toISOString() ?? null };
    if (overdue._count && (input.alertOverdue || !dryRun)) await raiseOperationalAlert({
      type: "PRIVACY_DELETION_OVERDUE", severity: "HIGH", service: "privacy", windowMinutes: 1440,
      message: "Planlanan tarihi geçmiş veri silme talepleri yürütme ve doğrulama bekliyor.",
      metadata: { count: overdue._count, oldestScheduledFor: counts.oldestDeletionScheduledFor },
    });
    await prisma.privacyRetentionRun.update({ where: { id: run.id }, data: { status: "COMPLETED", counts, completedAt: new Date() } });
    return { id: run.id, dryRun, counts };
  } catch (error) {
    await prisma.privacyRetentionRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "PRIVACY_RETENTION_FAILED", completedAt: new Date() } });
    throw error;
  }
}
