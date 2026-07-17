import "server-only";
import { prisma } from "@/server/db";
import { PRIVACY_RETENTION_POLICY_VERSION } from "@/server/privacy/catalog";
import { expirePrivacyExports } from "@/server/privacy/export";

export async function runPrivacyRetention(input: { dryRun?: boolean; initiatedByUserId?: string }) {
  const dryRun = input.dryRun !== false;
  const run = await prisma.privacyRetentionRun.create({
    data: { policyVersion: PRIVACY_RETENTION_POLICY_VERSION, dryRun, initiatedByUserId: input.initiatedByUserId },
  });
  try {
    const activeHolds = await prisma.privacyLegalHold.count({ where: { status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } });
    const exports = await expirePrivacyExports({ dryRun });
    const counts = { activeLegalHolds: activeHolds, exports, destructiveDeletionJobsExecuted: 0 };
    await prisma.privacyRetentionRun.update({ where: { id: run.id }, data: { status: "COMPLETED", counts, completedAt: new Date() } });
    return { id: run.id, dryRun, counts };
  } catch (error) {
    await prisma.privacyRetentionRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "PRIVACY_RETENTION_FAILED", completedAt: new Date() } });
    throw error;
  }
}
