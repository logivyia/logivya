import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_PRODUCT_FEATURE_STATUS,
  PRODUCT_CONTENT,
  PRODUCT_FEATURE_STATUSES,
  isVisibleProductFeature,
} from "../src/config/product-content";
import { PUBLIC_PRODUCT_PAGES } from "../src/config/public-product-pages";
import {
  CANONICAL_SUBSCRIPTION_PLANS,
  canonicalSubscriptionPlanCode,
} from "../src/config/subscription-plans";
import {
  automaticListingDefaultTtlHours,
  automaticListingExpiry,
  classifyLogisticsSector,
} from "../src/server/freight/sector-classification";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const contains = (file: string, pattern: string | RegExp, message: string) => {
  const source = read(file);
  assert(pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern), message);
};

assert.equal(PRODUCT_CONTENT.tr.category, "Canlı Lojistik Pazarı ve Akıllı Eşleştirme Platformu");
assert.equal(PRODUCT_CONTENT.tr.headline, "Lojistiği Logivya ile Yönet");
assert.equal(PRODUCT_CONTENT.tr.descriptionWithFacebook, "Yük, araç ve şoför ilanları oluşturun; canlı lojistik pazarındaki fırsatları takip edin ve taleplerinize uygun sonuçları akıllı eşleştirmeyle bulun. WhatsApp, Telegram ve Facebook Sayfaları entegrasyonlarıyla ilan, paylaşım ve iletişim süreçlerinizi tek yerden yönetin.");
assert.equal(PRODUCT_CONTENT.tr.slogan, "İlanını Yayınla. Uygun Fırsatı Bul. Lojistiği Logivya ile Yönet.");
assert(!PRODUCT_CONTENT.tr.description.includes("Facebook"), "INTERNAL Facebook must be omitted from active homepage copy");
assert.deepEqual(PRODUCT_CONTENT.tr.featureCards.map((card) => card.title), [
  "Canlı Lojistik Pazarı",
  "Akıllı Talep Eşleştirme",
  "Sektörel Lojistik Alanları",
  "İlan ve Operasyon Yönetimi",
  "WhatsApp ve Telegram Entegrasyonu",
  "Facebook Sayfaları ve İçerik Yönetimi",
]);

assert.deepEqual(PRODUCT_FEATURE_STATUSES, ["INTERNAL", "BETA", "PUBLIC", "COMING_SOON", "DISABLED"]);
assert.equal(DEFAULT_PRODUCT_FEATURE_STATUS.FACEBOOK_PAGES, "INTERNAL");
assert.equal(DEFAULT_PRODUCT_FEATURE_STATUS.WHATSAPP_ACCOUNTS, "PUBLIC");
assert.equal(isVisibleProductFeature("INTERNAL", "PUBLIC"), false);
assert.equal(isVisibleProductFeature("BETA", "AUTHENTICATED"), true);
contains("src/server/features/product-status.ts", "requireProductFeature", "Backend feature status must enforce availability");
contains("src/server/features/product-status.ts", "META_CONFIGURATION_INCOMPLETE", "Provider configuration must fail closed");

const expectedSlugs = [
  "logivya-nedir", "canli-lojistik-pazari", "akilli-eslestirme", "yuk-paylas", "yuk-bul",
  "arac-paylas", "arac-bul", "sofor-ilani", "sofor-bul", "ilanlarim", "talep-olustur",
  "evden-eve-nakliyat", "parsiyel-yuk", "agir-nakliyat", "whatsapp-yonetimi",
  "telegram-yonetimi", "facebook-sayfalari", "mesaj-otomasyonu", "canli-ilanlar",
  "fiyatlandirma", "hakkimizda", "sss",
];
assert.deepEqual(PUBLIC_PRODUCT_PAGES.map((page) => page.slug), expectedSlugs);
assert.equal(new Set(PUBLIC_PRODUCT_PAGES.map((page) => page.title)).size, PUBLIC_PRODUCT_PAGES.length);
assert.equal(new Set(PUBLIC_PRODUCT_PAGES.map((page) => page.description)).size, PUBLIC_PRODUCT_PAGES.length);
for (const page of PUBLIC_PRODUCT_PAGES) {
  assert(page.audience.length > 40, `${page.slug} must identify its audience`);
  assert(page.howItWorks.length >= 2, `${page.slug} must explain how it works`);
  assert(page.useCases.length >= 1, `${page.slug} must contain use cases`);
  assert(page.limitations.length >= 1, `${page.slug} must contain realistic limitations`);
}
contains("src/app/[publicSlug]/page.tsx", "if (unavailable) notFound()", "INTERNAL and disabled pages must not be public");
contains("src/app/[publicSlug]/page.tsx", '"@type": "BreadcrumbList"', "Public pages must expose breadcrumbs");
contains("src/app/[publicSlug]/page.tsx", '"@type": "SoftwareApplication"', "Available product pages must expose factual structured data");
contains("src/app/[publicSlug]/page.tsx", 'languages: { tr:', "Public pages must expose locale alternates");
contains("src/app/sitemap.ts", 'status === "PUBLIC" || status === "BETA" || status === "COMING_SOON"', "Sitemap must omit INTERNAL features");
contains("src/app/robots.ts", '"/api/"', "Private API routes must be blocked from crawling");
contains("src/app/robots.ts", '"/admin/"', "Admin routes must be blocked from crawling");
contains("src/app/page.tsx", "Logivya | Canlı Lojistik Pazarı ve Akıllı Eşleştirme Platformu", "Homepage SEO title must be canonical");

const trial = CANONICAL_SUBSCRIPTION_PLANS.trial;
const plus = CANONICAL_SUBSCRIPTION_PLANS.starter;
const pro = CANONICAL_SUBSCRIPTION_PLANS.professional;
assert.deepEqual([trial.canonicalCode, plus.canonicalCode, pro.canonicalCode], ["LOGIVYA_TRIAL_7D", "LOGIVYA_PLUS", "LOGIVYA_PRO"]);
assert.deepEqual([trial.monthlyPriceMinor, plus.monthlyPriceMinor, pro.monthlyPriceMinor], [0, 28_000, 38_000]);
assert.deepEqual([trial.accountLimit, plus.accountLimit, pro.accountLimit], [1, 2, 3]);
assert.deepEqual([trial.marketingFeatures.tr.length, plus.marketingFeatures.tr.length, pro.marketingFeatures.tr.length], [16, 15, 17]);
assert.equal(plus.signatureBehavior, "BRANDED");
assert.equal(pro.signatureBehavior, "UNBRANDED");
assert.equal(canonicalSubscriptionPlanCode("Starter"), "starter");
assert.equal(canonicalSubscriptionPlanCode("LOGIVYA_PLUS"), "starter");
assert.equal(canonicalSubscriptionPlanCode("Profesyonel"), "professional");
assert.equal(canonicalSubscriptionPlanCode("LOGIVYA_PRO"), "professional");

assert.equal(classifyLogisticsSector({ text: "Asansörlü evden eve nakliyat ve paketleme" }).primarySector, "HOME_MOVING");
assert.equal(classifyLogisticsSector({ text: "3 palet parsiyel grupaj yük" }).primarySector, "PARTIAL_LOAD");
assert.equal(classifyLogisticsSector({ text: "Lowbed ile gabari dışı iş makinesi" }).primarySector, "HEAVY_HAUL");
assert.equal(classifyLogisticsSector({ text: "Mersin Ankara 25 ton tenteli yük hazır" }).primarySector, "GENERAL_LOGISTICS");
const multiSector = classifyLogisticsSector({ text: "Evden eve taşıma ile birlikte parsiyel palet yük" });
assert.equal(multiSector.primarySector, "MULTI_SECTOR");
assert(multiSector.marketplaceScopes.includes("GLOBAL") && multiSector.marketplaceScopes.includes("HOME_MOVING") && multiSector.marketplaceScopes.includes("PARTIAL_LOAD"));
assert.equal(automaticListingDefaultTtlHours(), 36);
const sourceTime = new Date("2026-08-29T00:00:00.000Z");
assert.equal(automaticListingExpiry(sourceTime, false)?.toISOString(), "2026-08-30T12:00:00.000Z");
assert.equal(automaticListingExpiry(sourceTime, true)?.toISOString(), "2026-08-30T12:00:00.000Z");
contains("src/server/freight/demand-validation.ts", "sectorCriteria", "Saved demands must retain sector criteria");
contains("apps/mobile/src/screens/app/demand-request-screens.tsx", "demandSectorFields", "Demand forms must render sector-specific fields");
for (const form of ["vehicle-listing-form.tsx", "driver-listing-form.tsx"]) {
  contains(`apps/mobile/src/components/${form}`, "sectorDetails", `${form} must retain sector details`);
}

const bottomBar = read("apps/mobile/src/components/marketplace-bottom-tab-bar.tsx");
const routeMatches = [...bottomBar.matchAll(/\{ route: "([^"]+)"/gu)].map((match) => match[1]);
assert.deepEqual(routeMatches, ["CreateLoad", "FindLoads", "MyListings", "VehicleMarketplace", "DriverMarketplace"]);
assert(bottomBar.includes("center = index === 2"), "İlanlarım must remain geometrically centered");
contains("apps/mobile/src/i18n/translations.ts", 'findAndShareVehicle: "Araç Bul - Paylaş"', "Combined vehicle label must be exact");
contains("apps/mobile/src/screens/app/vehicle-marketplace-screens.tsx", "VehicleWorkspaceSwitch", "Vehicle destination must be a real two-mode workspace");
contains("apps/mobile/src/navigation/linking.ts", 'CreateVehicle: "share"', "Legacy share-vehicle links must map into the unified workspace");
contains("apps/mobile/src/components/web-parity-tab-bar.tsx", "gesture.x0 > 32", "Drawer gesture must start from the safe edge");
contains("apps/mobile/src/components/web-parity-tab-bar.tsx", "gesture.dx >= 56", "Short drawer swipes must cancel");
contains("apps/mobile/src/components/web-parity-tab-bar.tsx", "gesture.dx > Math.abs(gesture.dy) * 1.35", "Vertical scroll must not open the drawer");

const picker = read("apps/mobile/src/components/message-attachment-picker.tsx");
assert.equal((picker.match(/<AttachmentAction/gu) ?? []).length, 3, "Plus sheet must expose photo, video, and document actions");
assert(picker.includes("pickMessagePhotos") && picker.includes("pickMessageVideos") && picker.includes("pickMessageDocuments"));
assert(picker.includes("onCancelUpload") && picker.includes("onRetryUpload"), "Attachment preview must expose cancel and retry");
assert(picker.includes("attachmentUploading"), "Attachment preview must expose progress");
const messaging = read("apps/mobile/src/screens/app/messaging-screen.tsx");
assert(/content,\s*\.\.\.\(uploaded\.length \? \{ mediaFileIds:/u.test(messaging), "Text and attachments must be submitted together");
assert(messaging.includes("uploadAbortRef") && messaging.includes("attachmentUploadState"), "Composer must preserve cancellable upload state");
contains("src/server/security/uploads.ts", "MAX_MESSAGE_ATTACHMENTS", "Server attachment limits must remain authoritative");
contains("src/server/whatsapp/outbound-payload.ts", "const caption = input.content || undefined", "WhatsApp media must retain written captions");

contains("prisma/schema.prisma", "model FacebookOAuthTransaction", "OAuth replay state must be persisted");
contains("prisma/schema.prisma", "model FacebookPublicationJob", "Facebook publishing must use a durable queue model");
contains("src/app/api/facebook/oauth/callback/route.ts", "verifyAndConsumeFacebookOAuthState", "OAuth state must be one-time use");
contains("src/server/facebook/posts.ts", "idempotencyKey", "Facebook publications must be idempotent");
contains("src/server/facebook/crypto.ts", "encryptSensitiveField", "Provider tokens must use the centralized encryption service");
contains("src/app/api/facebook/deauthorize/route.ts", "readFacebookSignedRequest", "Meta deauthorization callbacks must be verified");
contains("src/app/api/facebook/data-deletion/route.ts", "readFacebookSignedRequest", "Meta deletion callbacks must be verified");
contains("src/server/facebook/accounts.ts", "companyId", "Facebook accounts must remain tenant-scoped");

const storeCopy = [
  read("packages/docs/google-play/store-listing-tr-TR.json"),
  read("packages/docs/google-play/store-listing-en-US.json"),
].join("\n");
assert(!/Facebook Pages/iu.test(storeCopy), "INTERNAL Facebook must not appear in public store copy");
assert(!/WhatsApp.*uygulamas/u.test(storeCopy), "Store copy must not position Logivya as a WhatsApp-only app");

console.log("Unified master product contracts: PASS");
