import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

import { canonicalSubscriptionPlanCatalog, canonicalSubscriptionPlanCode } from "../src/config/subscription-plans";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const plans = await prisma.plan.findMany({
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { slug: "asc" },
  });
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { members: true, accounts: true } },
    },
  });

  const legacyPlans = plans
    .filter((plan) => !["trial", "starter", "professional"].includes(plan.slug))
    .map((plan) => ({
      slug: plan.slug,
      mappedTo: canonicalSubscriptionPlanCode(plan.slug) ?? canonicalSubscriptionPlanCode(plan.name),
      active: plan.isActive,
      subscriptions: plan._count.subscriptions,
    }));
  const expectedBySlug = new Map(canonicalSubscriptionPlanCatalog().map((plan) => [plan.slug, plan]));
  const catalogMismatches = plans.flatMap((plan) => {
    const expected = expectedBySlug.get(plan.slug as "trial" | "starter" | "professional");
    if (!expected) return [];
    const actualMonthly = Number(plan.monthlyPrice.toString());
    const actualYearly = Number(plan.yearlyPrice.toString());
    const expectedMonthly = expected.monthlyPriceMinor / 100;
    const expectedYearly = expected.yearlyPriceMinor / 100;
    if (actualMonthly === expectedMonthly && actualYearly === expectedYearly && plan.isActive) return [];
    return [{
      slug: plan.slug,
      actual: { monthlyPrice: actualMonthly, yearlyPrice: actualYearly, active: plan.isActive },
      expected: { monthlyPrice: expectedMonthly, yearlyPrice: expectedYearly, active: true },
    }];
  });
  const remediation = companies.flatMap((company) => {
    const plan = company.subscriptions[0]?.plan;
    const code = canonicalSubscriptionPlanCode(plan?.slug);
    const limit = code === "trial" ? 1 : code === "starter" ? 2 : code === "professional" ? 3 : null;
    if (!limit || (company._count.members <= limit && company._count.accounts <= limit)) return [];
    return [{
      companyId: company.id,
      plan: plan?.slug ?? null,
      accountLimit: limit,
      accounts: company._count.members,
      whatsappConnections: company._count.accounts,
      action: "REVIEW_ONLY_NO_AUTOMATIC_DELETION",
    }];
  });

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    migrationRequired: catalogMismatches.length > 0 || legacyPlans.some((plan) => plan.active || plan.subscriptions > 0),
    catalogMismatches,
    canonicalPlans: plans.filter((plan) => ["trial", "starter", "professional"].includes(plan.slug)).map((plan) => ({
      slug: plan.slug,
      monthlyPrice: plan.monthlyPrice.toString(),
      yearlyPrice: plan.yearlyPrice.toString(),
      subscriptions: plan._count.subscriptions,
    })),
    legacyPlans,
    remediation,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
