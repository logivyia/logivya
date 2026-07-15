import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { serializeSubscription } from "../src/server/billing/subscription-state";
import { DAY_IN_MILLISECONDS, remainingDaysUntil, TRIAL_DURATION_DAYS, trialEndsAt } from "../src/server/billing/trial-policy";
import { normalizeVerifiedPhone } from "../src/server/billing/trial-service";

const root = process.cwd();

function read(file: string) {
  return readFileSync(path.join(root, file), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const start = new Date("2026-07-11T10:00:00.000Z");
const end = trialEndsAt(start);
assert(TRIAL_DURATION_DAYS === 7, "Trial duration must be seven days.");
assert(end.getTime() - start.getTime() === 7 * DAY_IN_MILLISECONDS, "Trial must end exactly seven days after verified WhatsApp activation.");
assert(remainingDaysUntil(end, start) === 7, "A new trial must display seven remaining days.");
assert(remainingDaysUntil(end, new Date(start.getTime() + DAY_IN_MILLISECONDS)) === 6, "Countdown must display six days after one full day.");
assert(remainingDaysUntil(end, end) === 0, "Expired trials must never display a negative remaining day count.");
const equivalentTurkishPhones = ["0555 123 00 01", "+90 555 123 00 01", "905551230001", "0090 555 123 00 01"];
assert(new Set(equivalentTurkishPhones.map((phone) => normalizeVerifiedPhone(phone))).size === 1, "Equivalent Turkish phone formats must normalize to one E.164 identity.");

const trialSubscription = {
  status: "TRIALING",
  source: "TRIAL",
  billingPeriod: "TRIAL",
  startsAt: start,
  endsAt: end,
  trialStartsAt: start,
  trialEndsAt: end,
  currentPeriodStartsAt: start,
  currentPeriodEndsAt: end,
  plan: {
    name: "Deneme",
    slug: "trial",
    trialDays: TRIAL_DURATION_DAYS,
    maxWhatsappAccounts: 1,
    maxTeamUsers: 1,
    advancedReportingEnabled: false,
    hasNoBranding: false,
    hasCrm: false,
    hasApi: false,
  },
} as unknown as NonNullable<Parameters<typeof serializeSubscription>[0]>;
const activeTrial = serializeSubscription(trialSubscription, start);
assert(activeTrial.isActive && !activeTrial.isExpired, "A new seven-day trial must be active.");
assert(activeTrial.remainingDays === 7, "Serialized trial state must expose seven remaining days.");
assert(activeTrial.entitlements.whatsappConnect, "Active trials must be entitled to WhatsApp connection.");
assert(activeTrial.entitlements.messageSend, "Active trials must be entitled to message sending.");
assert(activeTrial.entitlements.scheduledMessages, "Active trials must be entitled to scheduled messages.");
assert(activeTrial.entitlements.recurringMessages, "Active trials must be entitled to recurring messages.");
assert(activeTrial.entitlements.deleteForEveryone, "Active trials must be entitled to Delete for Everyone.");
const expiredTrial = serializeSubscription(trialSubscription, new Date(end.getTime() + 1));
assert(expiredTrial.isExpired && !expiredTrial.entitlements.messageSend, "Expired trials must lock paid message sending without deleting account access.");
assert(expiredTrial.entitlements.accountAccess && expiredTrial.entitlements.messageHistory, "Expired trials must retain account and history access.");

for (const file of [
  "src/app/api/auth/register/route.ts",
  "src/app/api/mobile/auth/register/route.ts",
]) {
  const content = read(file);
  assert(content.includes("createPendingTrialEntitlement"), `${file} must create a pending identity-bound trial candidate.`);
  assert(!content.includes("ensureSevenDayTrial"), `${file} must not start the trial during registration.`);
  assert(!content.includes("3 * 86_400_000"), `${file} must not contain a three-day calculation.`);
}

const trialService = read("src/server/billing/trial-service.ts");
assert(trialService.includes("pg_advisory_xact_lock"), "Trial activation must serialize verified identity decisions.");
assert(trialService.includes("PENDING_IDENTITY"), "Registration must wait for verified WhatsApp identity.");
assert(trialService.includes('source: "TRIAL"'), "Verified eligible identities must create a company trial subscription.");
assert(trialService.includes("TRIAL_IDENTITY_ALREADY_USED"), "A previously consumed WhatsApp identity must not receive another trial.");

const access = read("src/server/billing/subscription-access.ts");
assert(access.includes('["ACTIVE", "TRIALING"]'), "Active trial subscriptions must pass the central subscription guard.");
assert(access.includes("canConnectWhatsAppAccount"), "Trial access regression guard must cover WhatsApp connection.");
assert(access.includes("canSendMessage"), "Trial access regression guard must cover message sending.");
assert(access.includes("canUseScheduledMessages"), "Trial access regression guard must cover scheduled messages.");
assert(access.includes("canUseRecurringMessages"), "Trial access regression guard must cover recurring messages.");

const migration = read("prisma/migrations/20260711134500_seven_day_full_access_trial/migration.sql");
assert(migration.includes('plan."slug" = \'trial\''), "Migration must target only the trial plan.");
assert(migration.includes('subscription."source" = \'TRIAL\''), "Migration must exclude paid and administrator-assigned subscriptions.");
assert(migration.includes('subscription."status" = \'TRIALING\''), "Migration must extend only active trial records.");
assert(migration.includes('subscription."trialEndsAt" > CURRENT_TIMESTAMP'), "Migration must not reset expired trials.");
const governanceMigration = read("prisma/migrations/20260715170000_company_subscription_seat_invitation_trial_governance/migration.sql");
assert(governanceMigration.includes('CREATE TABLE "TrialEntitlement"'), "Trial identity governance table must be migrated safely.");
assert(governanceMigration.includes('TrialEntitlement_consumed_phone_key'), "Consumed verified phone identities must be unique.");

const mobileSubscription = read("apps/mobile/src/api/mobileSubscription.ts");
assert(mobileSubscription.includes("trialStartsAt"), "Android contract must expose the backend trial start timestamp.");
assert(mobileSubscription.includes("trialEndsAt"), "Android contract must expose the backend trial end timestamp.");
assert(mobileSubscription.includes("remainingDays"), "Android contract must use the backend remaining-day value.");

const activeSources = [
  "src",
  "apps/mobile/src",
  "prisma/seed.ts",
].map((entry) => path.join(root, entry));
for (const source of activeSources) {
  const files = source.endsWith(".ts") ? [source] : listSourceFiles(source);
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    assert(!/3\s+(gün|days?)(lük)?\s+(ücretsiz\s+)?deneme/i.test(content), `${path.relative(root, file)} still contains visible three-day trial text.`);
  }
}

console.log("Seven-day trial policy, registration, migration and client contracts passed.");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const candidate = path.join(directory, name);
    return statSync(candidate).isDirectory() ? listSourceFiles(candidate) : /\.(ts|tsx|json)$/.test(name) ? [candidate] : [];
  });
}
