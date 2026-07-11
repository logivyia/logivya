import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const databaseUrl = requireDatabaseUrl();

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is missing.");
  return value;
}

async function count(client: Client, sql: string) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const trialPlans = await client.query<{ id: string; trialDays: number }>(`
      SELECT id, "trialDays"
      FROM "Plan"
      WHERE slug = 'trial'
    `);
    const eligibleActiveThreeDayTrials = await count(client, `
      SELECT COUNT(*) AS count
      FROM "Subscription" subscription
      JOIN "Plan" plan ON plan.id = subscription."planId"
      WHERE plan.slug = 'trial'
        AND subscription.source = 'TRIAL'
        AND subscription.status = 'TRIALING'
        AND subscription."trialStartsAt" IS NOT NULL
        AND subscription."trialEndsAt" IS NOT NULL
        AND subscription."trialEndsAt" > CURRENT_TIMESTAMP
        AND subscription."trialEndsAt" BETWEEN
          subscription."trialStartsAt" + INTERVAL '71 hours'
          AND subscription."trialStartsAt" + INTERVAL '73 hours'
    `);
    const activeSevenDayTrials = await count(client, `
      SELECT COUNT(*) AS count
      FROM "Subscription" subscription
      JOIN "Plan" plan ON plan.id = subscription."planId"
      WHERE plan.slug = 'trial'
        AND subscription.source = 'TRIAL'
        AND subscription.status = 'TRIALING'
        AND subscription."trialEndsAt" > CURRENT_TIMESTAMP
        AND subscription."trialEndsAt" BETWEEN
          subscription."trialStartsAt" + INTERVAL '167 hours'
          AND subscription."trialStartsAt" + INTERVAL '169 hours'
    `);
    const expiredThreeDayTrialsLeftUntouched = await count(client, `
      SELECT COUNT(*) AS count
      FROM "Subscription" subscription
      JOIN "Plan" plan ON plan.id = subscription."planId"
      WHERE plan.slug = 'trial'
        AND subscription.source = 'TRIAL'
        AND subscription."trialStartsAt" IS NOT NULL
        AND subscription."trialEndsAt" <= CURRENT_TIMESTAMP
        AND subscription."trialEndsAt" BETWEEN
          subscription."trialStartsAt" + INTERVAL '71 hours'
          AND subscription."trialStartsAt" + INTERVAL '73 hours'
    `);
    const duplicateTrialCompanies = await count(client, `
      SELECT COUNT(*) AS count
      FROM (
        SELECT "companyId"
        FROM "Subscription"
        WHERE source = 'TRIAL'
        GROUP BY "companyId"
        HAVING COUNT(*) > 1
      ) duplicate_trials
    `);
    const invalidTrialDates = await count(client, `
      SELECT COUNT(*) AS count
      FROM "Subscription" subscription
      JOIN "Plan" plan ON plan.id = subscription."planId"
      WHERE plan.slug = 'trial'
        AND subscription."trialStartsAt" IS NOT NULL
        AND subscription."trialEndsAt" IS NOT NULL
        AND subscription."trialEndsAt" <= subscription."trialStartsAt"
    `);
    const orphanTrialSubscriptions = await count(client, `
      SELECT COUNT(*) AS count
      FROM "Subscription" subscription
      LEFT JOIN "Company" company ON company.id = subscription."companyId"
      LEFT JOIN "Plan" plan ON plan.id = subscription."planId"
      WHERE subscription.source = 'TRIAL'
        AND (company.id IS NULL OR plan.id IS NULL)
    `);

    const blockers = [
      trialPlans.rowCount === 1 ? null : `Expected exactly one trial plan, found ${trialPlans.rowCount ?? 0}.`,
      duplicateTrialCompanies === 0 ? null : `Found ${duplicateTrialCompanies} companies with duplicate trial subscriptions.`,
      invalidTrialDates === 0 ? null : `Found ${invalidTrialDates} trial subscriptions with invalid date order.`,
      orphanTrialSubscriptions === 0 ? null : `Found ${orphanTrialSubscriptions} orphan trial subscriptions.`,
    ].filter((value): value is string => Boolean(value));

    const database = new URL(databaseUrl);
    const report = {
      generatedAt: new Date().toISOString(),
      databaseHost: database.hostname,
      migrationPolicy: {
        newTrialDurationDays: 7,
        extendsOnlyActiveApproximateThreeDayTrials: true,
        expiredTrialsRemainUntouched: true,
        paidAndAdminAssignedSubscriptionsRemainUntouched: true,
      },
      trialPlan: {
        count: trialPlans.rowCount ?? 0,
        configuredDays: trialPlans.rows[0]?.trialDays ?? null,
      },
      counts: {
        eligibleActiveThreeDayTrials,
        activeSevenDayTrials,
        expiredThreeDayTrialsLeftUntouched,
        duplicateTrialCompanies,
        invalidTrialDates,
        orphanTrialSubscriptions,
      },
      blockers,
      safeToDeploy: blockers.length === 0,
    };
    console.log(JSON.stringify(report, null, 2));
    if (blockers.length > 0) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
