import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { ensureSevenDayTrial } from "../src/server/billing/trial-service";
import { DAY_IN_MILLISECONDS, TRIAL_DURATION_DAYS } from "../src/server/billing/trial-policy";

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
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const rollbackMessage = "ROLLBACK_SEVEN_DAY_TRIAL_INTEGRATION_TEST";

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is missing.");
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = randomUUID();
  const email = `trial-integration-${suffix}@example.invalid`;
  const username = `trial-integration-${suffix}`;

  try {
    await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findUnique({ where: { slug: "trial" } });
      assert(plan, "Trial plan is missing.");
      assert(plan.trialDays === TRIAL_DURATION_DAYS, "Production trial plan is not configured for seven days.");

      const user = await tx.user.create({
        data: { name: "Trial Integration Test", username, email, passwordHash: "not-a-login-credential", locale: "tr" },
      });
      const company = await tx.company.create({
        data: { name: "Trial Integration Test", ownerId: user.id, email: user.email },
      });
      const startedAt = new Date();
      const first = await ensureSevenDayTrial(tx, { companyId: company.id, planId: plan.id, userId: user.id, startedAt });
      assert(first.created, "The first registration attempt must create a trial.");
      assert(first.subscription.status === "TRIALING", "The created trial must be active.");
      assert(first.subscription.trialStartsAt?.getTime() === startedAt.getTime(), "Trial start must match registration completion time.");
      assert(
        (first.subscription.trialEndsAt?.getTime() ?? 0) - startedAt.getTime() === TRIAL_DURATION_DAYS * DAY_IN_MILLISECONDS,
        "Trial end must be exactly seven days after registration.",
      );

      const second = await ensureSevenDayTrial(tx, { companyId: company.id, planId: plan.id, userId: user.id, startedAt });
      assert(!second.created, "A registration retry must not create a duplicate trial.");
      assert(second.subscription.id === first.subscription.id, "A registration retry must resolve the original trial.");
      assert(await tx.subscription.count({ where: { companyId: company.id, source: "TRIAL" } }) === 1, "The company must have exactly one trial.");

      throw new Error(rollbackMessage);
    }, { timeout: 30_000 });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMessage) throw error;
  }

  assert(await prisma.user.count({ where: { email } }) === 0, "Integration test data was not rolled back.");
  console.log("Seven-day registration integration test passed; transaction rolled back with no persistent test data.");
}

void main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
