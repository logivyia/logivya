import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  normalizeMobileSubscriptionDraftResponse,
  normalizeMobileSubscriptionRequestsResponse,
  normalizeMobileSubscriptionSubmitResponse,
} from "../apps/mobile/src/api/mobile-response-normalizers";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const checkout = {
  checkoutAvailable: true,
  missingSellerFields: [],
  seller: {
    officialName: "LOGIVYA",
    taxOffice: "Test",
    taxNumber: "1234567890",
    email: "support@logivya.com",
    phone: "+905520048107",
  },
  bank: {
    accountHolder: "BURAK IDIM",
    bankName: "Ziraat Bankasi",
    ibanDisplay: "TR08 0001 0002 8896 3148 1650 09",
    ibanNormalized: "TR080001000288963148165009",
  },
};

const legacyRequest = {
  id: "request-legacy",
  publicId: "SUB-LEGACY",
  status: "DRAFT",
  billingPeriod: "MONTHLY",
  amount: "280",
  currency: "TRY",
  planCode: "STARTER",
  planName: "Baslangic",
  planSnapshot: null,
  buyerSnapshot: {
    name: "Test User",
    email: "test@example.com",
  },
  seller: null,
  bank: null,
  paymentReference: "LOG-LEGACY",
  legalDocuments: null,
  createdAt: "2026-07-30T08:00:00.000Z",
  updatedAt: "2026-07-30T08:00:00.000Z",
};

const normalizedList = normalizeMobileSubscriptionRequestsResponse({
  requests: [legacyRequest, null, "invalid"],
  checkout,
});
assert.equal(normalizedList.requests.length, 1);
assert.equal(normalizedList.requests[0]?.seller.officialName, "LOGIVYA");
assert.equal(
  normalizedList.requests[0]?.bank.ibanNormalized,
  checkout.bank.ibanNormalized,
);
assert.deepEqual(normalizedList.requests[0]?.legalDocuments, []);
assert.equal(normalizedList.requests[0]?.planSnapshot.accountLimit, 0);

const requestAt = (
  id: string,
  status: string,
  createdAt: string,
) => ({
  ...legacyRequest,
  id,
  publicId: `SUB-${id}`,
  status,
  createdAt,
  updatedAt: createdAt,
});

const latestFromUnorderedResponse =
  normalizeMobileSubscriptionRequestsResponse({
    requests: [
      requestAt("request-older", "CANCELLED", "2026-07-29T08:00:00.000Z"),
      requestAt("request-newest", "AWAITING_PAYMENT", "2026-07-31T08:00:00.000Z"),
      requestAt("request-middle", "REJECTED", "2026-07-30T08:00:00.000Z"),
    ],
    checkout,
  });
assert.equal(latestFromUnorderedResponse.requests.length, 1);
assert.equal(latestFromUnorderedResponse.requests[0]?.id, "request-newest");

for (const status of [
  "AWAITING_PAYMENT",
  "CANCELLED",
  "REJECTED",
  "APPROVED",
] as const) {
  const response = normalizeMobileSubscriptionRequestsResponse({
    requests: [
      requestAt("request-old", "AWAITING_PAYMENT", "2026-07-30T08:00:00.000Z"),
      requestAt(`request-latest-${status}`, status, "2026-07-31T08:00:00.000Z"),
    ],
    checkout,
  });
  assert.equal(response.requests.length, 1);
  assert.equal(response.requests[0]?.status, status);
}

const equalTimestampResponse = normalizeMobileSubscriptionRequestsResponse({
  requests: [
    requestAt("request-a", "CANCELLED", "2026-07-31T08:00:00.000Z"),
    requestAt("request-z", "REJECTED", "2026-07-31T08:00:00.000Z"),
  ],
  checkout,
});
assert.equal(equalTimestampResponse.requests[0]?.id, "request-z");

const legalDocuments = [
  "PRE_INFORMATION_FORM",
  "DISTANCE_SALES_AGREEMENT",
  "REFUND_WITHDRAWAL_POLICY",
].map((type) => ({
  type,
  title: type,
  version: "2026-07-30-v3",
  hash: "a".repeat(64),
  content: "LOGIVYA legal content",
}));
const compatibleDraft = {
  ...legacyRequest,
  seller: undefined,
  bank: checkout.bank,
  legalDocuments,
};
const normalizedDraft = normalizeMobileSubscriptionDraftResponse({
  draft: compatibleDraft,
  correlationId: "mob-test",
});
assert.equal(normalizedDraft.draft?.seller.officialName, "LOGIVYA");
assert.equal(normalizedDraft.draft?.legalDocuments.length, 3);

const normalizedSubmit = normalizeMobileSubscriptionSubmitResponse({
  request: {
    ...compatibleDraft,
    status: "AWAITING_PAYMENT",
  },
  message: "ok",
});
assert.equal(normalizedSubmit.request?.seller.officialName, "LOGIVYA");
assert.equal(normalizedSubmit.request?.bank.bankName, checkout.bank.bankName);

const emptyResponse = normalizeMobileSubscriptionRequestsResponse(null);
assert.deepEqual(emptyResponse.requests, []);
assert.equal(emptyResponse.checkout.checkoutAvailable, false);

const screen = read(
  "apps/mobile/src/screens/app/subscription-screen.tsx",
);
assert(
  screen.includes(
    'membershipAccess?.capabilities?.["tenant.subscription.manage"]',
  ),
);
assert(
  screen.includes('request.seller?.officialName || "LOGIVYA"'),
);
assert(
  screen.includes("const canPurchaseManualSubscription = false"),
  "Mobile clients must not expose the manual or external purchase flow",
);
for (const iosPurchaseGuard of [
  "{canSelectPlan && canPurchaseManualSubscription ? (",
  "{canPurchaseManualSubscription ? (",
  "{canSelectPlan && canPurchaseManualSubscription",
  "visible={canPurchaseManualSubscription && Boolean(draft)}",
  "request={canPurchaseManualSubscription ? draft : null}",
  "request={canPurchaseManualSubscription ? createdRequest : null}",
  "canPurchaseManualSubscription && Boolean(createdRequest)",
  't("billing.ios.managedTitle")',
  't("billing.ios.managedDescription")',
]) {
  assert(
    screen.includes(iosPurchaseGuard),
    `Missing iOS purchase guard: ${iosPurchaseGuard}`,
  );
}

const mobileApi = read("apps/mobile/src/api/mobileSubscription.ts");
for (const contract of [
  "normalizeMobileSubscriptionRequestsResponse",
  "normalizeMobileSubscriptionDraftResponse",
  "normalizeMobileSubscriptionSubmitResponse",
  "MobileSubscriptionDomainError",
  "DATA_CONTRACT_INVALID",
]) {
  assert(mobileApi.includes(contract), `Missing mobile contract: ${contract}`);
}

const recoveryContext = read(
  "apps/mobile/src/services/mobile-recovery-context.ts",
);
for (const contract of [
  "LOGIVYA_MOBILE_RECOVERY_CONTEXT",
  "getCurrentMobileRecoveryId",
  "hydrateMobileRecoveryContext",
]) {
  assert(
    recoveryContext.includes(contract),
    `Missing recovery contract: ${contract}`,
  );
}

const apiClient = read("apps/mobile/src/api/client.ts");
assert(apiClient.includes('"X-Client-Recovery-Id"'));

const clientEventsRoute = read(
  "src/app/api/observability/client-events/route.ts",
);
assert(clientEventsRoute.includes('"mobile-root-boundary"'));
assert(clientEventsRoute.includes('"mobile.client.recovery_reported"'));
assert(clientEventsRoute.includes("recoveryId"));

const backendRequests = read(
  "src/server/billing/manual-subscription-requests.ts",
);
assert(backendRequests.includes("LEGACY_LOGIVYA_SELLER"));
assert(
  backendRequests.includes(
    "legalDocumentsForRequest(request, seller)",
  ),
);
for (const tenantScope of [
  "where: {\n      companyId,",
  "requestedByUserId: userId",
  'status: { not: "DRAFT" }',
  'orderBy: [{ createdAt: "desc" }, { id: "desc" }]',
  "listManualSubscriptionRequestsForAdmin",
]) {
  assert(
    backendRequests.includes(tenantScope),
    `Missing scoped request-history contract: ${tenantScope}`,
  );
}

const subscriptionStore = read(
  "apps/mobile/src/features/subscription/subscriptionStore.ts",
);
assert(subscriptionStore.includes("await get().load();"));
assert(subscriptionStore.includes("reset: () =>"));

assert(screen.includes('t("billing.manual.noRequests")'));
assert.equal(
  screen.match(/t\("billing\.manual\.legalDocuments"\)/g)?.length,
  1,
  "The large legal-document section must be removed; the modal fallback title remains.",
);
assert(!screen.includes("styles.legalDocumentButton"));
assert(screen.includes('accessibilityRole="checkbox"'));
assert(screen.includes("disabled={requesting || !allAccepted}"));
assert(screen.includes("onPress={() => onOpen(document)}"));
for (const legalContract of [
  'PRE_INFORMATION_FORM: "billing.manual.preInformationForm"',
  'DISTANCE_SALES_AGREEMENT: "billing.manual.distanceSalesAgreement"',
  'REFUND_WITHDRAWAL_POLICY: "billing.manual.refundPolicy"',
]) {
  assert(screen.includes(legalContract), `Missing legal link: ${legalContract}`);
}

console.log(
  "Mobile subscription latest-request, legal UI, DTO compatibility and recovery tests passed.",
);
