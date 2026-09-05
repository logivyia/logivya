import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CANONICAL_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PLAN_CODES,
  canonicalSubscriptionPlanCode,
  serializeCanonicalSubscriptionPlan,
} from "../src/config/subscription-plans";

assert.deepEqual([...SUBSCRIPTION_PLAN_CODES], ["trial", "starter", "professional"]);

const trial = CANONICAL_SUBSCRIPTION_PLANS.trial;
const starter = CANONICAL_SUBSCRIPTION_PLANS.starter;
const professional = CANONICAL_SUBSCRIPTION_PLANS.professional;

assert.deepEqual(
  [trial.monthlyPriceMinor, starter.monthlyPriceMinor, professional.monthlyPriceMinor],
  [0, 28_000, 38_000],
);
assert.deepEqual(
  [starter.yearlyPriceMinor, starter.yearlyMonthlyEquivalentMinor],
  [300_000, 25_000],
);
assert.deepEqual(
  [professional.yearlyPriceMinor, professional.yearlyMonthlyEquivalentMinor],
  [420_000, 35_000],
);
assert.deepEqual(
  [trial.accountLimit, starter.accountLimit, professional.accountLimit],
  [1, 2, 3],
);
assert.deepEqual(
  [trial.whatsappConnectionLimit, starter.whatsappConnectionLimit, professional.whatsappConnectionLimit],
  [1, 2, 3],
);

assert.equal(trial.trialDurationDays, 7);
assert.equal(trial.features.contactMessaging, true);
assert.equal(starter.features.contactMessaging, true);
assert.equal(professional.features.contactMessaging, true);
assert.equal(trial.features.brandingFooter, true);
assert.equal(starter.features.brandingFooter, true);
assert.equal(professional.features.brandingFooter, false);
assert.equal(trial.featureCodes.length, 8);
assert.equal(starter.featureCodes.length, 7);
assert.equal(professional.featureCodes.length, 7);

for (const [alias, expected] of Object.entries({
  trial: "trial",
  free: "trial",
  deneme: "trial",
  starter: "starter",
  basic: "starter",
  beginning: "starter",
  baslangic: "starter",
  "Ba\u015flang\u0131\u00e7": "starter",
  professional: "professional",
  pro: "professional",
  profesyonel: "professional",
})) {
  assert.equal(canonicalSubscriptionPlanCode(alias), expected, `${alias} must map to ${expected}.`);
}
assert.equal(canonicalSubscriptionPlanCode("enterprise"), null);

const serializedStarter = serializeCanonicalSubscriptionPlan(starter);
assert.equal(serializedStarter.monthlyPrice, 28_000);
assert.equal(serializedStarter.yearlyPrice, 300_000);
assert.equal(serializedStarter.displayNameKey, "home.plan.starter.name");
assert.deepEqual(serializedStarter.billingIntervals, ["MONTHLY", "YEARLY"]);

const billingPage = readFileSync("src/components/billing-subscriptions-page.tsx", "utf8");
const homePage = readFileSync("src/components/home-page-client.tsx", "utf8");
const turkish = JSON.parse(readFileSync("packages/locales/tr.json", "utf8")) as Record<string, string>;
assert(!billingPage.includes("billing.mostPopular"), "Billing cards must not render a duplicate Popular badge.");
assert(!homePage.includes("home.plan.professional.badge"), "Public pricing must not render a duplicate Professional badge.");
assert.deepEqual([trial.marketingFeatures.tr.length, starter.marketingFeatures.tr.length, professional.marketingFeatures.tr.length], [16, 15, 17]);
assert.deepEqual(trial.marketingFeatures.tr.slice(0, 4), [
  "Canlı Lojistik Pazarına erişim",
  "Yük Bul ve Yük Paylaş",
  "Araç Bul ve Araç Paylaş",
  "Şoför Bul ve Şoför İlanı Ver",
]);
assert.equal(starter.marketingFeatures.tr[0], "Canlı Lojistik Pazarına erişim");
assert(!starter.marketingFeatures.tr.includes("Logivya’nın bütün özelliklerine erişim"));
assert.equal(professional.marketingFeatures.tr.at(-1), "Gelişmiş destek");
assert.equal(turkish["home.plan.trial.description"], "Logivya’nın canlı lojistik, ilan, eşleştirme ve iletişim özelliklerini 7 gün boyunca ücretsiz deneyin.");
assert.equal(turkish["home.plan.starter.description"], "Canlı lojistik pazarını, ilan süreçlerini ve iletişim operasyonlarını ekip halinde yönetin.");
assert.equal(turkish["home.plan.professional.description"], "Gelişmiş lojistik, akıllı eşleştirme ve mesajlaşma operasyonlarını ekip halinde yönetin.");
assert.equal(turkish["home.plan.trial.cta"], "7 Gün Ücretsiz Dene");
assert.equal(turkish["home.plan.starter.cta"], "Logivya Plus’ı Seç");
assert.equal(turkish["home.plan.professional.cta"], "Logivya Pro’yu Seç");
assert(!Object.values(turkish).some((value) => /En fazla [23] WhatsApp bağlantısı/i.test(value)));

const migration = readFileSync("prisma/migrations/20260721120000_canonical_subscription_plans/migration.sql", "utf8");
assert(migration.includes('UPDATE "Subscription" subscription'), "Legacy subscriptions must be remapped without deletion.");
assert(migration.includes('LOWER(legacy."name")'), "Translated legacy plan names must be remapped safely.");
assert(migration.includes("'başlangıç'"), "The Turkish Başlangıç alias must be covered by the migration.");
assert(!/DELETE\s+FROM\s+"(?:Plan|Subscription|Payment)"/i.test(migration), "Canonical migration must not delete billing records.");
assert(migration.includes('"maxMessagesPerDay" = 2147483647'), "Legacy daily message limits must be neutralized.");
assert(migration.includes('"maxMessagesPerMonth" = 2147483647'), "Legacy monthly message limits must be neutralized.");

console.log("Canonical Trial, Starter and Professional catalog, aliases, pricing, branding and migration contracts passed.");
