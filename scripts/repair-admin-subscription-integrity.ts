import { loadEnvConfig } from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { resolveAdminSeatIntegrity } from "../src/server/billing/admin-seat-integrity";
import { isCompanySubscriptionActive } from "../src/server/billing/company-entitlements";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema: "public" }),
});

type RepairKind = "OWNER_MEMBERSHIP" | "PENDING_TRIAL_ENTITLEMENT";

async function main() {
  const apply = process.argv.includes("--apply");
  const now = new Date();
  const [companies, zeroSeatPlans] = await Promise.all([
    prisma.company.findMany({
      include: {
        owner: { select: { id: true, email: true } },
        members: { select: { userId: true, role: true, status: true, lifecycleState: true } },
        invitations: {
          where: { status: "PENDING", reservedSeat: true, expiresAt: { gt: now } },
          select: { id: true },
        },
        subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" } },
        trialEntitlements: { select: { status: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.plan.findMany({
      where: { isActive: true, maxTeamUsers: { lte: 0 } },
      select: { id: true, slug: true, maxTeamUsers: true },
    }),
  ]);

  const findings: Array<{
    companyId: string;
    companyName: string;
    integrityStatus: string;
    seats: string;
    repairs: RepairKind[];
    review: string[];
  }> = [];

  for (const company of companies) {
    const activeSubscription = company.subscriptions.find((subscription) => isCompanySubscriptionActive(subscription, now));
    const hasOwnerMembership = company.members.some((membership) => (
      membership.userId === company.ownerId
      && membership.role === "OWNER"
      && membership.status === "ACTIVE"
      && membership.lifecycleState === "INDEPENDENT_OWNER"
    ));
    const activeMembers = company.members.filter((membership) => membership.status === "ACTIVE").length;
    const suspendedMembers = company.members.filter((membership) => membership.status === "SUSPENDED").length;
    const invitedMembers = company.members.filter((membership) => membership.status === "INVITED").length;
    const trialStatus = company.trialEntitlements[0]?.status;
    const integrity = resolveAdminSeatIntegrity({
      companyName: company.name,
      ownerEmail: company.owner.email,
      hasOwnerMembership,
      hasActiveSubscription: Boolean(activeSubscription),
      hasAnySubscription: company.subscriptions.length > 0,
      activePlanSlug: activeSubscription?.plan.slug,
      activePlanMaxTeamUsers: activeSubscription?.plan.maxTeamUsers,
      trialEntitlementStatus: trialStatus,
      activeMembers,
      suspendedMembers,
      invitedMembers,
      pendingInvitations: company.invitations.length,
    });

    if (integrity.integrityStatus === "RETIRED") continue;

    const repairs: RepairKind[] = [];
    const review: string[] = [];
    if (!hasOwnerMembership) repairs.push("OWNER_MEMBERSHIP");
    if (!trialStatus && company.subscriptions.length === 0) repairs.push("PENDING_TRIAL_ENTITLEMENT");
    if (integrity.reconciliationRequired) review.push("ACTIVE_SEAT_USAGE_EXCEEDS_CANONICAL_LIMIT");
    if (activeSubscription && integrity.capacitySource === "ACTIVE_UNKNOWN_PLAN") review.push("UNKNOWN_ACTIVE_PLAN");

    if (repairs.length || review.length || integrity.configurationRequired) {
      findings.push({
        companyId: company.id,
        companyName: company.name,
        integrityStatus: integrity.integrityStatus,
        seats: `${integrity.used}/${integrity.limit}`,
        repairs,
        review,
      });
    }
  }

  const report = {
    mode: apply ? "APPLY" : "DRY_RUN",
    generatedAt: now.toISOString(),
    scannedCompanies: companies.length,
    actionableFindings: findings.filter((finding) => finding.repairs.length > 0).length,
    manualReviewFindings: findings.filter((finding) => finding.review.length > 0).length,
    invalidActivePlans: zeroSeatPlans,
    findings,
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  for (const finding of findings) {
    if (!finding.repairs.length) continue;
    const company = companies.find((candidate) => candidate.id === finding.companyId)!;
    await prisma.$transaction(async (tx) => {
      if (finding.repairs.includes("OWNER_MEMBERSHIP")) {
        await tx.companyUser.upsert({
          where: { companyId_userId: { companyId: company.id, userId: company.ownerId } },
          create: {
            companyId: company.id,
            userId: company.ownerId,
            createdByUserId: company.ownerId,
            role: "OWNER",
            status: "ACTIVE",
            lifecycleState: "INDEPENDENT_OWNER",
            activationCompletedAt: now,
            independentConvertedAt: now,
          },
          update: {
            role: "OWNER",
            status: "ACTIVE",
            lifecycleState: "INDEPENDENT_OWNER",
            removedAt: null,
            suspendedAt: null,
            activationCompletedAt: now,
            independentConvertedAt: now,
          },
        });
      }
      if (finding.repairs.includes("PENDING_TRIAL_ENTITLEMENT")) {
        await tx.trialEntitlement.upsert({
          where: { companyId_userId: { companyId: company.id, userId: company.ownerId } },
          create: {
            companyId: company.id,
            userId: company.ownerId,
            status: "PENDING_IDENTITY",
            decisionCode: "ADMIN_INTEGRITY_REPAIR_PENDING_IDENTITY",
          },
          update: {},
        });
      }
      await tx.subscriptionAuditLog.create({
        data: {
          companyId: company.id,
          eventType: "ADMIN_SUBSCRIPTION_INTEGRITY_REPAIR",
          previousState: { repairsRequired: finding.repairs },
          newState: { ownerMembership: true, pendingTrialEntitlement: true },
          correlationId: `repair:${now.toISOString()}`,
        },
      });
    });
  }

  console.log(JSON.stringify({ ...report, applied: true }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
