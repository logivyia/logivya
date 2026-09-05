import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PRODUCT_CONTENT } from "../src/config/product-content";
import { CANONICAL_SUBSCRIPTION_PLANS, canonicalSubscriptionPlanCatalog } from "../src/config/subscription-plans";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const home = read("src/components/home-page-client.tsx");
const publicHeader = read("src/components/public-header.tsx");
const publicPricing = read("src/components/public-pricing-cards.tsx");
const publicProductPage = read("src/app/[publicSlug]/page.tsx");
const language = read("src/components/language-selector.tsx");
const social = read("src/components/social-login-buttons.tsx");
const globalStyles = read("src/app/globals.css");
const mobileBenefits = read("apps/mobile/src/features/subscription/mobile-plan-benefits.tsx");
const mobileSubscriptionScreen = read("apps/mobile/src/screens/app/subscription-screen.tsx");

assert.equal(PRODUCT_CONTENT.tr.headline, "Lojistiği Logivya ile Yönet");
assert(!home.includes("productCopy.description}</p>"), "Hero must not render the old explanatory paragraph below the H1");
assert(!home.includes("Yükü, Aracı ve Şoförü Doğru Fırsatlarla Buluşturan Logivya"), "Old hero copy must be absent");
assert(!home.includes("productCopy.extendedDefinition"), "The duplicate lower product-explanation block must stay removed");
assert(home.includes("<PublicHeader />") && publicProductPage.includes("<PublicHeader />"), "Every primary public surface must reuse the approved public header");
assert(publicHeader.includes("grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"), "Desktop header must use a true three-region grid");
assert(publicHeader.includes("sm:hidden") && publicHeader.includes("sm:grid"), "Header must provide a responsive stacked mobile layout");
assert(publicHeader.includes("<LanguageSelector dark />") && publicHeader.includes('destination="/login"') && publicHeader.includes('destination="/register"'));

assert(language.includes('aria-haspopup="listbox"'));
assert(language.includes('role="option"') && language.includes("aria-selected"));
for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"]) assert(language.includes(key));
assert(language.includes("createPortal") && language.includes("VIEWPORT_PADDING"), "Language popover must be portaled and collision-aware");
assert(language.includes("closeMenu(true)"), "Closing the language menu must be able to restore trigger focus");

const trLocale = read("packages/locales/tr.json");
assert(trLocale.includes('"auth.continueWithGoogle": "Google ile devam et"'));
assert(trLocale.includes('"auth.continueWithApple": "Apple ile devam et"'));
assert(social.includes("max-w-[400px]") && social.includes("h-11 w-full"), "Provider buttons must share one geometry");
assert(social.includes("window.google.accounts.id.initialize") && social.includes("window.AppleID.auth.init"), "Provider auth logic must remain intact");
assert(social.includes("grid-cols-[minmax(0,1fr)_3rem]"), "Provider labels need an equal right-side balancing slot");
assert(social.includes("aria-busy") && social.includes('role="status"'), "Social authentication must announce loading state");

const plans = canonicalSubscriptionPlanCatalog();
assert.deepEqual(plans.map((plan) => plan.slug), ["trial", "starter", "professional"]);
assert.deepEqual(plans.map((plan) => plan.monthlyPriceMinor), [0, 28_000, 38_000]);
assert.deepEqual(plans.map((plan) => plan.accountLimit), [1, 2, 3]);
for (const plan of plans) {
  assert.equal(plan.marketingSummaryGroups.tr.length, 7, `${plan.slug} must expose seven Turkish summary groups`);
  assert.equal(plan.marketingSummaryGroups.en.length, 7, `${plan.slug} must expose seven English summary groups`);
  const sectorOrder = plan.marketingFeatures.tr.slice(0, 9);
  assert(sectorOrder.indexOf("Genel Lojistik") < sectorOrder.indexOf("Evden Eve Nakliyat"), `${plan.slug} must list General Logistics first`);
  assert(!plan.marketingFeatures.tr.includes("Logivya’nın bütün özelliklerine erişim"));
}
assert.equal(CANONICAL_SUBSCRIPTION_PLANS.starter.seatClarification.tr, "Paket sahibi dahil, her biri kendi giriş bilgileriyle erişen toplam 2 kullanıcı.");
assert.equal(CANONICAL_SUBSCRIPTION_PLANS.professional.seatClarification.tr, "Paket sahibi dahil, her biri kendi giriş bilgileriyle erişen toplam 3 kullanıcı.");
for (const forbidden of ["İmzasız gönderim", "Reklamsız kullanım", "Öncelikli destek"]) {
  assert(!CANONICAL_SUBSCRIPTION_PLANS.professional.marketingFeatures.tr.includes(forbidden));
}
assert(home.includes("<PublicPricingCards />"), "The homepage must render the shared public pricing cards");
assert(publicProductPage.includes('page.slug === "fiyatlandirma"') && publicProductPage.includes("<PublicPricingCards embedded"), "The canonical pricing URL must render the real pricing cards");
assert(publicPricing.includes('["MONTHLY", "YEARLY"]') && publicPricing.includes("yearlyPriceMinor"), "Public pricing must preserve monthly and yearly selection");
assert(publicPricing.includes('const isTrial = plan.slug === "trial"'));
assert(!publicPricing.includes('home.plan.trial.period') && publicPricing.includes("!isTrial ? ("), "Trial must not repeat the seven-day-free message below its plan name");
assert(publicPricing.includes("Tüm özellikleri gör") && publicPricing.includes("Özellikleri gizle"));
assert(publicPricing.includes("<h4"), "Summary groups and expanded feature sections need semantic headings");
assert(globalStyles.includes("prefers-reduced-motion: reduce"), "Web UI must respect reduced-motion preferences");
assert(mobileBenefits.includes("MobilePlanDetailsDisclosure") && mobileBenefits.includes("MobilePlanSeatInfo"));
assert(!mobileBenefits.includes("MobilePlanSeatHelp") && !mobileBenefits.includes("seatClarification"), "Native plan cards must keep the requested concise feature-only presentation");
assert(mobileBenefits.includes('plan.slug !== "trial"') && mobileBenefits.includes('`${seatCount} ${locale === "tr" ? "kullanıcı"'), "Paid expanded details must include the plan seat count");
assert(!mobileSubscriptionScreen.includes("<MobilePlanSeatHelp />"), "Removed seat-help copy must not reappear in the manual purchase flow");
for (const storeFile of ["apple-subscription-store.tsx", "google-play-subscription-store.tsx"]) {
  const source = read(`apps/mobile/src/features/subscription/${storeFile}`);
  assert(source.indexOf("<PrimaryButton") < source.indexOf("<MobilePlanDetailsDisclosure"), `${storeFile} must keep purchase CTA before detailed features`);
  assert(!source.includes("<MobilePlanSeatHelp />"), `${storeFile} must keep removed seat-help copy out of the native purchase screen`);
  assert(source.includes("sortOrder") && source.includes("Number.MAX_SAFE_INTEGER"), `${storeFile} must order products by the canonical plan order instead of provider IDs`);
}

for (const locale of ["tr", "en", "ar", "ro", "ru", "az", "tk", "de", "bg", "el", "sr"]) {
  const messages = JSON.parse(read(`packages/locales/${locale}.json`)) as Record<string, string>;
  assert(messages["home.plan.trial.name"].startsWith("Logivya"), `${locale} trial name must preserve the Logivya brand identity`);
  assert.equal(messages["home.plan.starter.name"], "Logivya Plus", `${locale} Plus name must preserve the Logivya brand identity`);
  assert.equal(messages["home.plan.professional.name"], "Logivya Pro", `${locale} Pro name must preserve the Logivya brand identity`);

  if (!(["tr", "en"] as string[]).includes(locale)) {
    const mobileMessages = JSON.parse(read(`apps/mobile/src/i18n/locales/${locale}.json`)) as Record<string, string>;
    assert(mobileMessages.planTrialName.startsWith("Logivya"), `${locale} mobile trial name must preserve the Logivya brand identity`);
    assert.equal(mobileMessages.planStarterName, "Logivya Plus", `${locale} mobile Plus name must preserve the Logivya brand identity`);
    assert.equal(mobileMessages.planProfessionalName, "Logivya Pro", `${locale} mobile Pro name must preserve the Logivya brand identity`);
  }
}

console.log("Prompt 4 public, authentication, and billing presentation contracts: PASS");
