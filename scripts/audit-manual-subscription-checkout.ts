import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

import {
  CANONICAL_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
} from "../src/config/subscription-plans";
import {
  LOGIVYA_BANK_CONFIGURATION_VERSION,
  LOGIVYA_BANK_TRANSFER,
} from "../src/server/billing/manual-subscription-config";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema: "public" }),
});

const activeRequestStatuses = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUIRED",
] as const;

function storedObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function main() {
  const [plans, seller, contractColumns] = await Promise.all([
    prisma.plan.findMany({
      where: { slug: { in: ["starter", "professional"] } },
      orderBy: { slug: "asc" },
    }),
    prisma.billingSellerConfiguration.findUnique({ where: { id: "logivya" } }),
    prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT "column_name"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'public'
        AND "table_name" = 'SubscriptionRequest'
    `,
  ]);
  const requiredContractColumns = [
    "transferDescriptionEmail",
    "pricingConfigVersion",
    "bankConfigVersion",
    "correlationId",
    "immediatePerformanceConsentAt",
  ];
  const availableColumns = new Set(
    contractColumns.map((column) => column.column_name),
  );
  const missingContractColumns = requiredContractColumns.filter(
    (column) => !availableColumns.has(column),
  );
  const activeRequests = missingContractColumns.length
    ? []
    : await prisma.subscriptionRequest.findMany({
        where: { status: { in: [...activeRequestStatuses] } },
        select: {
          publicId: true,
          planCode: true,
          billingPeriod: true,
          amount: true,
          currency: true,
          transferDescriptionEmail: true,
          pricingConfigVersion: true,
          bankConfigVersion: true,
          bankSnapshot: true,
          buyerSnapshot: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });

  const planMismatches = plans.flatMap((plan) => {
    const canonical = CANONICAL_SUBSCRIPTION_PLANS[
      plan.slug as "starter" | "professional"
    ];
    const expected = {
      monthlyPrice: canonical.monthlyPriceMinor / 100,
      yearlyPrice: canonical.yearlyPriceMinor / 100,
      currency: canonical.currency,
      active: true,
    };
    const actual = {
      monthlyPrice: Number(plan.monthlyPrice),
      yearlyPrice: Number(plan.yearlyPrice),
      currency: plan.currency,
      active: plan.isActive,
    };
    return JSON.stringify(actual) === JSON.stringify(expected)
      ? []
      : [{ slug: plan.slug, actual, expected }];
  });

  const activeRequestMismatches = activeRequests.flatMap((request) => {
    const planSlug = request.planCode.toLowerCase();
    if (planSlug !== "starter" && planSlug !== "professional") {
      return [{ requestId: request.publicId, reason: "UNKNOWN_PLAN" }];
    }
    const canonical = CANONICAL_SUBSCRIPTION_PLANS[planSlug];
    const expectedAmount =
      request.billingPeriod === "YEARLY"
        ? canonical.yearlyPriceMinor / 100
        : canonical.monthlyPriceMinor / 100;
    const bank = storedObject(request.bankSnapshot);
    const buyer = storedObject(request.buyerSnapshot);
    const reasons = [
      Number(request.amount) !== expectedAmount ? "PRICE_MISMATCH" : null,
      request.currency !== "TRY" ? "CURRENCY_MISMATCH" : null,
      request.transferDescriptionEmail
        && request.transferDescriptionEmail
          !== String(buyer.email || "").trim().toLocaleLowerCase("en-US")
        ? "TRANSFER_EMAIL_MISMATCH"
        : null,
      request.pricingConfigVersion
        && request.pricingConfigVersion
          !== SUBSCRIPTION_PRICING_CONFIGURATION_VERSION
        ? "PRICING_VERSION_MISMATCH"
        : null,
      request.bankConfigVersion
        && request.bankConfigVersion !== LOGIVYA_BANK_CONFIGURATION_VERSION
        ? "BANK_VERSION_MISMATCH"
        : null,
      String(bank.bankName || "") !== LOGIVYA_BANK_TRANSFER.bankName
        ? "BANK_NAME_MISMATCH"
        : null,
      String(bank.accountHolder || "") !== LOGIVYA_BANK_TRANSFER.accountHolder
        ? "ACCOUNT_HOLDER_MISMATCH"
        : null,
      String(bank.ibanNormalized || "")
        !== LOGIVYA_BANK_TRANSFER.ibanNormalized
        ? "IBAN_MISMATCH"
        : null,
    ].filter(Boolean);
    return reasons.length
      ? [{
          requestId: request.publicId,
          status: request.status,
          reasons,
        }]
      : [];
  });

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pricingConfigVersion: SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
    bankConfigVersion: LOGIVYA_BANK_CONFIGURATION_VERSION,
    expectedBank: LOGIVYA_BANK_TRANSFER,
    sellerConfigurationPresent: Boolean(seller),
    sellerConfigurationVerifiedAt: seller?.verifiedAt?.toISOString() || null,
    legalDocumentsApprovedAt:
      seller?.legalDocumentsApprovedAt?.toISOString() || null,
    migrationPending: missingContractColumns.length > 0,
    missingContractColumns,
    planMismatches,
    activeRequestCount: activeRequests.length,
    activeRequestMismatches,
    passed:
      Boolean(seller)
      && missingContractColumns.length === 0
      && planMismatches.length === 0
      && activeRequestMismatches.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
