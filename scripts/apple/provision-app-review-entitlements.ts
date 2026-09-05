import "dotenv/config";

import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { activateCompanySubscription } from "@/server/billing/subscription-activation";
import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";

import {
  appStoreConnectRequest,
  loadAppleConfiguration,
} from "./app-store-connect-client.mjs";

const APPLY_FLAG = "ALLOW_PRODUCTION_APP_REVIEW_PROVISION";
const PROFESSIONAL_REVIEW_DAYS = 180;

function assertProductionApproval() {
  if (process.env[APPLY_FLAG] !== "1") {
    throw new Error(`${APPLY_FLAG}=1 is required.`);
  }
  if (process.env.VERCEL_ENV !== "production") {
    throw new Error("VERCEL_ENV must be production.");
  }
}

async function resolveReviewAccountEmail() {
  const configuration = loadAppleConfiguration();
  const versions = await appStoreConnectRequest(
    configuration,
    `/v1/apps/${configuration.appStoreAppId}/appStoreVersions`,
    { "filter[platform]": "IOS", limit: 50 },
  );
  const version = versions.payload?.data?.find(
    (entry: { attributes?: { versionString?: string } }) =>
      entry.attributes?.versionString === "1.0",
  );
  if (!version?.id) throw new Error("APP_STORE_VERSION_NOT_FOUND");

  const reviewDetail = await appStoreConnectRequest(
    configuration,
    `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`,
  );
  const email = reviewDetail.payload?.data?.attributes?.demoAccountName
    ?.trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("APP_REVIEW_ACCOUNT_NOT_CONFIGURED");
  }

  return { email, versionId: version.id };
}

async function main() {
  assertProductionApproval();
  const reviewAccount = await resolveReviewAccountEmail();
  const [user, admin] = await Promise.all([
    prisma.user.findUnique({
      where: { email: reviewAccount.email },
      select: {
        id: true,
        status: true,
        ownedCompanies: { select: { id: true } },
        memberships: {
          where: { status: "ACTIVE" },
          select: { companyId: true, role: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
      select: { id: true, status: true },
    }),
  ]);
  if (!user || user.status !== "ACTIVE") {
    throw new Error("APP_REVIEW_USER_NOT_ACTIVE");
  }
  if (!admin || admin.status !== "ACTIVE") {
    throw new Error("PLATFORM_OWNER_NOT_ACTIVE");
  }

  const companyIds = new Set([
    ...user.ownedCompanies.map((company) => company.id),
    ...user.memberships.map((membership) => membership.companyId),
  ]);
  if (companyIds.size !== 1) {
    throw new Error("APP_REVIEW_COMPANY_SCOPE_AMBIGUOUS");
  }
  const companyId = [...companyIds][0];
  const current = await resolveCompanyEntitlements(companyId);
  if (
    current?.valid &&
    current.plan.slug === "professional" &&
    (!current.subscription.endsAt ||
      current.subscription.endsAt.getTime() >
        Date.now() + 14 * 24 * 60 * 60 * 1000)
  ) {
    console.log(
      JSON.stringify({
        ok: true,
        changed: false,
        reason: "PROFESSIONAL_REVIEW_ACCESS_ALREADY_ACTIVE",
        appStoreVersionId: reviewAccount.versionId,
      }),
    );
    return;
  }

  const startsAt = new Date();
  const endsAt = new Date(
    startsAt.getTime() + PROFESSIONAL_REVIEW_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await activateCompanySubscription({
    companyId,
    planSlug: "professional",
    billingPeriod: "MONTHLY",
    startsAt,
    endsAt,
    source: "MANUAL_ADMIN",
    actorUserId: admin.id,
    reason: "App Store Review feature-access provisioning",
    correlationId: `app-review:${reviewAccount.versionId}:professional`,
  });

  console.log(
    JSON.stringify({
      ok: true,
      changed: true,
      plan: result.subscription.planId ? "professional" : "unknown",
      validUntil: endsAt.toISOString(),
      appStoreVersionId: reviewAccount.versionId,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
