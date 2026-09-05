import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  CANONICAL_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
} from "../src/config/subscription-plans";
import {
  buildLogivyaBillingLegalDocuments,
  LOGIVYA_SELLER_DISPLAY_NAME,
} from "../src/server/billing/manual-subscription-config";
import { evaluateCheckoutIdentity } from "../src/server/billing/checkout-identity";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function sourceFiles(directory: string): string[] {
  const absolute = path.join(root, directory);
  return readdirSync(absolute).flatMap((entry) => {
    const relative = path.join(directory, entry);
    const target = path.join(root, relative);
    if (statSync(target).isDirectory()) return sourceFiles(relative);
    return /\.(?:ts|tsx|json|sql)$/.test(entry) ? [relative] : [];
  });
}

const starter = CANONICAL_SUBSCRIPTION_PLANS.starter;
const professional = CANONICAL_SUBSCRIPTION_PLANS.professional;
assert.equal(starter.monthlyPriceMinor, 28_000);
assert.equal(professional.monthlyPriceMinor, 38_000);
assert.equal(starter.yearlyPriceMinor, 300_000);
assert.equal(professional.yearlyPriceMinor, 420_000);
assert.equal(starter.yearlyMonthlyEquivalentMinor, 25_000);
assert.equal(professional.yearlyMonthlyEquivalentMinor, 35_000);
assert.equal(starter.accountLimit, 2);
assert.equal(professional.accountLimit, 3);
assert.equal(starter.whatsappConnectionLimit, 2);
assert.equal(professional.whatsappConnectionLimit, 3);
assert.equal(starter.features.brandingFooter, true);
assert.equal(professional.features.brandingFooter, false);
assert.equal(starter.features.advertisingEnabled, true);
assert.equal(professional.features.advertisingEnabled, false);
for (const plan of [starter, professional]) {
  assert.equal(plan.features.contactMessaging, true);
  assert.equal(plan.features.groupMessaging, true);
  assert.equal(plan.features.scheduledMessaging, true);
  assert.equal(plan.features.recurringMessaging, true);
  assert.equal(plan.features.deleteForEveryone, true);
}
assert.match(
  SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
  /^\d{4}-\d{2}-\d{2}-v\d+$/,
);

const completeIdentity = evaluateCheckoutIdentity({
  firstName: "Burak",
  lastName: "İdim",
  email: "burakidim@gmail.com",
});
assert.equal(completeIdentity.eligible, true);
assert.deepEqual(completeIdentity.missingFields, []);
assert.equal(completeIdentity.customer.fullName, "Burak İdim");

for (const optionalField of ["phone", "address", "tax identity"]) {
  assert.equal(
    evaluateCheckoutIdentity({
      firstName: "Burak",
      lastName: "İdim",
      email: "burakidim@gmail.com",
    }).eligible,
    true,
    `Optional ${optionalField} must not block checkout.`,
  );
}
assert.deepEqual(
  evaluateCheckoutIdentity({ lastName: "İdim", email: "burakidim@gmail.com" })
    .missingFields,
  ["PROFILE_FIRST_NAME_MISSING"],
);
assert.deepEqual(
  evaluateCheckoutIdentity({ firstName: "Burak", email: "burakidim@gmail.com" })
    .missingFields,
  ["PROFILE_LAST_NAME_MISSING"],
);
assert.deepEqual(
  evaluateCheckoutIdentity({ firstName: "Burak", lastName: "İdim" })
    .missingFields,
  ["PROFILE_EMAIL_MISSING"],
);

const legacyIdentity = evaluateCheckoutIdentity({
  fullName: "Ayşe Yılmaz",
  email: "ayse@example.com",
});
assert.equal(legacyIdentity.eligible, true);
assert.equal(legacyIdentity.identitySource, "LEGACY_FULL_NAME");
assert.equal(legacyIdentity.customer.firstName, "Ayşe");
assert.equal(legacyIdentity.customer.lastName, "Yılmaz");

const normalizedIdentity = evaluateCheckoutIdentity({
  firstName: "  Burak   Ali ",
  lastName: " İdim  ",
  email: "  BURAKIDIM@GMAIL.COM ",
});
assert.equal(normalizedIdentity.customer.firstName, "Burak Ali");
assert.equal(normalizedIdentity.customer.lastName, "İdim");
assert.equal(normalizedIdentity.customer.email, "burakidim@gmail.com");
assert.equal(
  evaluateCheckoutIdentity({
    firstName: "Çağrı",
    lastName: "Şahin",
    email: "cagri@example.com",
  }).customer.fullName,
  "Çağrı Şahin",
);

const configuration = read("src/server/billing/manual-subscription-config.ts");
assert(configuration.includes('accountHolder: "BURAK İDİM"'));
assert(configuration.includes('bankName: "Ziraat Bankası"'));
assert(
  configuration.includes('ibanDisplay: "TR08 0001 0002 8896 3148 1650 09"'),
);
assert(configuration.includes('ibanNormalized: "TR080001000288963148165009"'));
assert(configuration.includes("LOGIVYA_BANK_CONFIGURATION_VERSION"));
assert(configuration.includes("LOGIVYA_BILLING_LEGAL_VERSION"));
assert(configuration.includes('"PRE_INFORMATION_FORM"'));
assert(configuration.includes('"DISTANCE_SALES_AGREEMENT"'));
assert(configuration.includes('"REFUND_WITHDRAWAL_POLICY"'));
assert(configuration.includes("transferDescription"));
assert(configuration.includes("orderReference"));
assert(configuration.includes("identityVerified"));
assert(configuration.includes("legalDocumentsApproved"));
assert(configuration.includes('LOGIVYA_SELLER_DISPLAY_NAME = "LOGIVYA"'));
assert(!configuration.includes("`Adres: ${seller.registeredAddress}`"));

const legalDocuments = buildLogivyaBillingLegalDocuments({
  seller: {
    officialName: "A legacy database seller name",
    taxOffice: "Test",
    taxNumber: "1234567890",
    email: "support@logivya.com",
    phone: "+905520048107",
    tradeRegistryNumber: null,
    mersisNumber: null,
  },
  buyerName: "Test Kullanıcı",
  buyerEmail: "test@example.com",
  buyerAddress: "Test adresi",
  planName: "Başlangıç",
  billingPeriodLabel: "Aylık",
  amountLabel: "280,00 TL",
  orderReference: "LOG-TEST",
  transferDescription: "test@example.com",
});
assert.equal(LOGIVYA_SELLER_DISPLAY_NAME, "LOGIVYA");
assert.equal(legalDocuments.length, 3);
for (const document of legalDocuments) {
  assert(document.content.includes("Satıcı/Hizmet Sağlayıcı: LOGIVYA"));
  assert(!document.content.includes("A legacy database seller name"));
  assert(!document.content.includes("BURAK İDİM"));
  assert(!/(?:^|\n)Adres:/m.test(document.content));
  assert.match(document.hash, /^[a-f0-9]{64}$/);
}

const domain = read("src/server/billing/manual-subscription-requests.ts");
assert(!domain.includes("isBillingProfileComplete(profile)"));
for (const requiredContract of [
  "getSubscriptionCheckoutEligibility",
  'status: "DRAFT"',
  'status: "AWAITING_PAYMENT"',
  "verifyAcceptedDocuments",
  "documentVersion",
  "documentHash",
  "documentSnapshot",
  "acceptedAt",
  "ipAddressMasked",
  "userAgentSummary",
  "createPlatformAdminRequestNotification",
  "TransactionIsolationLevel.Serializable",
  "FOR UPDATE",
  "activeRequestKey",
  "ACTIVE_REQUEST_STATUSES",
  "ACTIVE_SUBSCRIPTION_REQUEST_EXISTS",
  "SUPERSEDED_BY_NEW_SELECTION",
  "transferDescriptionEmail",
  "pricingConfigVersion",
  "bankConfigVersion",
  "immediatePerformanceConsentAt",
  "eligibility.customer.email",
  "P2002",
]) {
  assert(
    domain.includes(requiredContract),
    `Missing domain contract: ${requiredContract}`,
  );
}

const activation = read("src/server/billing/subscription-activation.ts");
for (const requiredContract of [
  "manualRequestId",
  "activationSubscriptionId",
  'toStatus: "ACTIVATED"',
  "TransactionIsolationLevel.Serializable",
  "manualRequest.transferDescriptionEmail",
  "manualRequest.immediatePerformanceConsentAt",
  "manualRequest.pricingConfigVersion",
  "manualRequest.bankConfigVersion",
]) {
  assert(
    activation.includes(requiredContract),
    `Missing activation contract: ${requiredContract}`,
  );
}
assert(activation.includes("&& !manualRequest"));
assert(
  !activation.includes("manualRequest.requestedByUserId !== company.ownerId"),
);

const approvalRoute = read(
  "src/app/api/admin/subscription-requests/[id]/approve/route.ts",
);
assert(approvalRoute.includes("z.literal(true)"));
assert(approvalRoute.includes("requireCriticalAdminAction("));
assert(approvalRoute.includes('"admin.subscriptions.approve"'));
assert(approvalRoute.includes("parsed.data.internalNote"));
assert(approvalRoute.includes("activateSubscriptionManually"));
assert(approvalRoute.includes("subscription-request:"));

const eligibilityRoute = read(
  "src/app/api/subscription/checkout-eligibility/route.ts",
);
const mobileEligibilityRoute = read(
  "src/app/api/mobile/subscription/checkout-eligibility/route.ts",
);
assert(eligibilityRoute.includes("getSubscriptionCheckoutEligibility"));
assert(eligibilityRoute.includes("private, no-store"));
assert(mobileEligibilityRoute.includes("getSubscriptionCheckoutEligibility"));
assert(mobileEligibilityRoute.includes("requireMobileAuth"));

const webDraftRoute = read(
  "src/app/api/billing/subscription-requests/route.ts",
);
const mobileDraftRoute = read(
  "src/app/api/mobile/subscription/requests/route.ts",
);
for (const route of [webDraftRoute, mobileDraftRoute]) {
  assert(route.includes("ACTIVE_SHARED_MEMBERSHIP_EXISTS"));
  assert(route.includes("enforceOperationRateLimit"));
}

const webSubmitRoute = read(
  "src/app/api/billing/subscription-requests/[id]/submit/route.ts",
);
const mobileSubmitRoute = read(
  "src/app/api/mobile/subscription/requests/[id]/submit/route.ts",
);
for (const route of [webSubmitRoute, mobileSubmitRoute]) {
  assert(route.includes("immediatePerformanceConsent"));
  assert(route.includes("z.literal(true)"));
}

const userUi = read("src/components/billing-subscriptions-page.tsx");
const mobileUi = read("apps/mobile/src/screens/app/subscription-screen.tsx");
for (const source of [userUi, mobileUi]) {
  assert(source.includes("transferDescription"));
  assert(source.includes("billing.manual.consentTitle"));
  assert(source.includes("billing.manual.purchase"));
  assert(source.includes("billing.manual.requestCreatedTitle"));
  assert(source.includes("billing.manual.transferDetails"));
  assert(source.includes("billing.manual.preInformationForm"));
  assert(source.includes("billing.manual.serviceProvider"));
  assert(!source.includes("Ödeme talebi geçici olarak kapalı"));
}
assert(userUi.includes("BillingLegalDocumentModal"));
assert(userUi.includes("LegalConsentSentence"));
assert.equal(
  userUi.match(/\{document\.content\}/g)?.length,
  1,
  "Web must render legal content only inside the selected-document modal.",
);
assert(mobileUi.includes("MobileBillingLegalDocumentModal"));
assert(mobileUi.includes("MobileLegalConsentSentence"));
assert(mobileUi.includes('edges={["top", "right", "bottom", "left"]}'));
assert.equal(
  mobileUi.match(/\{document\?\.content \?\? ""\}/g)?.length,
  1,
  "Mobile must render legal content only inside the selected-document modal.",
);
assert(userUi.includes("/api/subscription/checkout-eligibility"));
const mobileSubscriptionApi = read("apps/mobile/src/api/mobileSubscription.ts");
assert(
  mobileSubscriptionApi.includes(
    "/api/mobile/subscription/checkout-eligibility",
  ),
);
assert(mobileSubscriptionApi.includes("immediatePerformanceConsent: true"));

const adminUi = read("src/components/admin-subscriptions-page.tsx");
const mobileAdminUi = read(
  "apps/mobile/src/screens/app/platform-module-screen.tsx",
);
for (const source of [adminUi, mobileAdminUi]) {
  assert(source.includes("transferDescription"));
  assert(source.includes("bankChecked"));
  assert(source.includes("workflowStatus"));
}

for (const migrationPath of [
  "prisma/migrations/20260726120000_manual_subscription_requests/migration.sql",
  "prisma/migrations/20260727120000_manual_subscription_request_deduplication/migration.sql",
  "prisma/migrations/20260728120000_manual_subscription_checkout_contract/migration.sql",
]) {
  const migration = read(migrationPath);
  assert(
    !/(?:^|\n)\s*(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i.test(
      migration,
    ),
    `${migrationPath} contains a destructive statement.`,
  );
}
const checkoutMigration = read(
  "prisma/migrations/20260728120000_manual_subscription_checkout_contract/migration.sql",
);
for (const field of [
  "transferDescriptionEmail",
  "pricingConfigVersion",
  "bankConfigVersion",
  "correlationId",
  "immediatePerformanceConsentAt",
]) {
  assert(checkoutMigration.includes(`"${field}"`));
}

const localeKeys = [
  "billing.manual.selectPlan",
  "billing.manual.consentTitle",
  "billing.manual.purchase",
  "billing.manual.requestCreatedTitle",
  "billing.manual.pendingPayment",
  "billing.manual.paymentReview",
  "billing.manual.approved",
  "billing.manual.rejected",
  "billing.manual.transferDetails",
  "billing.manual.status",
  "billing.manual.registeredEmail",
  "billing.manual.profileFirstNameMissing",
  "billing.manual.profileLastNameMissing",
  "billing.manual.profileEmailMissing",
  "billing.manual.activeSharedMembership",
  "billing.manual.consentRequired",
  "billing.manual.preInformationForm",
  "billing.manual.serviceProvider",
  "billing.manual.consentText",
];
for (const locale of [
  "tr",
  "en",
  "ro",
  "ru",
  "az",
  "tk",
  "de",
  "bg",
  "el",
  "sr",
]) {
  const dictionary = JSON.parse(
    read(`packages/locales/${locale}.json`),
  ) as Record<string, string>;
  for (const key of localeKeys) {
    assert(dictionary[key], `${locale} is missing ${key}.`);
  }
  for (const titleKey of [
    "billing.manual.distanceSalesAgreement",
    "billing.manual.preInformationForm",
    "billing.manual.refundPolicy",
  ]) {
    assert(
      dictionary["billing.manual.consentText"].includes(dictionary[titleKey]),
      `${locale} consent text must contain the clickable ${titleKey} label.`,
    );
  }
}

const mobileTranslations = read("apps/mobile/src/i18n/translations.ts");
for (const key of localeKeys) {
  assert(
    mobileTranslations.includes(`"${key}"`),
    `Mobile base translations are missing ${key}.`,
  );
}
for (const locale of ["ro", "ru", "az", "tk", "de", "bg", "el", "sr"]) {
  const dictionary = JSON.parse(
    read(`apps/mobile/src/i18n/locales/${locale}.json`),
  ) as Record<string, string>;
  for (const key of localeKeys) {
    assert(dictionary[key], `Mobile ${locale} is missing ${key}.`);
  }
  for (const titleKey of [
    "billing.manual.distanceSalesAgreement",
    "billing.manual.preInformationForm",
    "billing.manual.refundPolicy",
  ]) {
    assert(
      dictionary["billing.manual.consentText"].includes(dictionary[titleKey]),
      `Mobile ${locale} consent text must contain the clickable ${titleKey} label.`,
    );
  }
}

const webShell = read("src/components/app-shell.tsx");
const webSupportIndex = webShell.indexOf('href: "/support"');
const webSubscriptionIndex = webShell.indexOf(
  'href: "/settings/subscriptions"',
);
assert(
  webSupportIndex >= 0 &&
    webSubscriptionIndex >= 0 &&
    webSupportIndex < webSubscriptionIndex,
  "Web Subscription must follow Support.",
);
assert.equal(
  webShell.match(/href:\s*"\/settings\/subscriptions"/g)?.length,
  1,
  "Web Subscription must have one navigation definition.",
);

const mobileDrawer = read("apps/mobile/src/components/web-parity-tab-bar.tsx");
assert(
  mobileDrawer.indexOf('{ name: "Support"') <
    mobileDrawer.indexOf('key: "Subscription"'),
  "Mobile Subscription must follow Support.",
);
assert(!mobileDrawer.includes('key: "SubscriptionSettings"'));

const mobileMore = read("apps/mobile/src/screens/app/more-screen.tsx");
const mobileMoreSupport = mobileMore.indexOf('title={t("support")}');
const mobileMoreSubscription = mobileMore.indexOf('title={t("subscription")}');
const mobileMoreAdmin = mobileMore.indexOf('title={t("adminSections")}');
assert(
  mobileMoreSupport < mobileMoreSubscription &&
    mobileMoreSubscription < mobileMoreAdmin,
  "Mobile More menu must place Subscription between Support and Admin.",
);
assert.equal(
  mobileMore.match(/title=\{t\("subscription"\)\}/g)?.length,
  1,
  "Mobile More menu must not duplicate Subscription.",
);

const activeSources = [
  ...sourceFiles("src"),
  ...sourceFiles("apps/mobile/src"),
  ...sourceFiles("packages/locales"),
].map((file) => ({ file, content: read(file) }));

for (const { file, content } of activeSources) {
  assert(
    !/ChatBridge|chatbridge\.tr|info@chatbridge/i.test(content),
    `${file} contains forbidden ChatBridge content.`,
  );
  assert(
    !/Kuveyt\s+Türk|SOFTWARE HOUSE TR/i.test(content),
    `${file} contains stale bank configuration.`,
  );
  assert(
    !/480\s*(?:TL|₺)|600\s*(?:TL|₺)/i.test(content),
    `${file} contains a stale subscription price.`,
  );
}

console.log(
  "Manual checkout eligibility, pricing, bank, legal consent, idempotency, authorization, admin approval, UI, localization and migration contracts passed.",
);
