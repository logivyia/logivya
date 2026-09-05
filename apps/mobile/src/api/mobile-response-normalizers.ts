import type { MfaMethodType, MfaStatus } from "./mfa-api";
import type {
  MobileBillingLegalDocument,
  MobileCompanyEntitlementSummary,
  MobileManualSubscriptionCheckout,
  MobileManualSubscriptionRequest,
  MobileMembershipAccess,
  MobilePlanCatalogItem,
  MobileSellerDetails,
  MobileSubscription,
  MobileSubscriptionCheckoutEligibility,
} from "./mobileSubscription";

type UnknownRecord = Record<string, unknown>;

const MFA_METHOD_TYPES = new Set<MfaMethodType>(["TOTP", "EMAIL_OTP"]);
const MFA_METHOD_STATUSES = new Set([
  "PENDING",
  "ENABLED",
  "DISABLED",
  "LOCKED",
  "REQUIRES_REVERIFICATION",
]);
const PLAN_CODES = new Set(["TRIAL", "STARTER", "PROFESSIONAL"]);
const PLAN_SLUGS = new Set(["trial", "starter", "professional"]);
const FEATURE_CODES = new Set([
  "ACCOUNT_ALLOWANCE",
  "BRANDED_MESSAGING",
  "UNBRANDED_MESSAGING",
  "CONTACT_MESSAGING",
  "GROUP_MESSAGING",
  "SCHEDULED_RECURRING",
  "DELETE_FOR_EVERYONE",
  "ADVANCED_SUPPORT",
  "TRIAL_DURATION",
]);
const BILLING_INTERVALS = new Set(["MONTHLY", "YEARLY"]);
const SUBSCRIPTION_REQUEST_STATUSES = new Set([
  "PENDING_PAYMENT",
  "PAYMENT_REVIEW",
  "DRAFT",
  "AWAITING_PAYMENT",
  "UNDER_REVIEW",
  "APPROVED",
  "ACTIVATED",
  "CLARIFICATION_REQUIRED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
]);
const PURCHASABLE_PLAN_CODES = new Set(["STARTER", "PROFESSIONAL"]);
const LEGAL_DOCUMENT_TYPES = new Set([
  "PRE_INFORMATION_FORM",
  "DISTANCE_SALES_AGREEMENT",
  "REFUND_WITHDRAWAL_POLICY",
]);
const CHECKOUT_PROFILE_ERROR_CODES = new Set([
  "PROFILE_FIRST_NAME_MISSING",
  "PROFILE_LAST_NAME_MISSING",
  "PROFILE_EMAIL_MISSING",
]);
const LOGIVYA_SELLER_FALLBACK: MobileSellerDetails = {
  officialName: "LOGIVYA",
  taxOffice: "",
  taxNumber: "",
  email: "",
  phone: "",
  tradeRegistryNumber: null,
  mersisNumber: null,
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function normalizeSeller(
  value: unknown,
  fallback?: MobileSellerDetails | null,
): MobileSellerDetails {
  const source = isRecord(value) ? value : {};
  const safeFallback = fallback ?? LOGIVYA_SELLER_FALLBACK;

  return {
    officialName:
      asString(source.officialName).trim()
      || safeFallback.officialName
      || LOGIVYA_SELLER_FALLBACK.officialName,
    taxOffice: asString(source.taxOffice).trim() || safeFallback.taxOffice,
    taxNumber: asString(source.taxNumber).trim() || safeFallback.taxNumber,
    email: asString(source.email).trim() || safeFallback.email,
    phone: asString(source.phone).trim() || safeFallback.phone,
    tradeRegistryNumber:
      asNullableString(source.tradeRegistryNumber)
      ?? safeFallback.tradeRegistryNumber
      ?? null,
    mersisNumber:
      asNullableString(source.mersisNumber)
      ?? safeFallback.mersisNumber
      ?? null,
  };
}

function normalizeBank(
  value: unknown,
  fallback?: MobileManualSubscriptionCheckout["bank"],
): MobileManualSubscriptionRequest["bank"] {
  const source = isRecord(value) ? value : {};
  const safeFallback = fallback ?? {
    accountHolder: "",
    bankName: "",
    ibanDisplay: "",
    ibanNormalized: "",
  };

  return {
    accountHolder: asString(source.accountHolder, safeFallback.accountHolder),
    bankName: asString(source.bankName, safeFallback.bankName),
    ibanDisplay: asString(source.ibanDisplay, safeFallback.ibanDisplay),
    ibanNormalized: asString(
      source.ibanNormalized,
      safeFallback.ibanNormalized,
    ),
  };
}

function normalizeLegalDocument(
  value: unknown,
): MobileBillingLegalDocument | null {
  if (!isRecord(value)) return null;
  const type = asString(value.type);
  if (!LEGAL_DOCUMENT_TYPES.has(type)) return null;

  return {
    type: type as MobileBillingLegalDocument["type"],
    title: asString(value.title, type),
    version: asString(value.version),
    hash: asString(value.hash),
    content: asString(value.content),
  };
}

function normalizeManualSubscriptionRequest(
  value: unknown,
  checkout: MobileManualSubscriptionCheckout,
): MobileManualSubscriptionRequest | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const publicId = asString(value.publicId);
  if (!id || !publicId) return null;

  const rawStatus = asString(value.status);
  const rawBillingPeriod = asString(value.billingPeriod);
  const rawPlanCode = asString(value.planCode);
  const planSnapshot = isRecord(value.planSnapshot) ? value.planSnapshot : {};
  const planFeatures = isRecord(planSnapshot.features)
    ? planSnapshot.features
    : {};
  const buyerSnapshot = isRecord(value.buyerSnapshot)
    ? value.buyerSnapshot
    : {};

  return {
    id,
    publicId,
    status: (SUBSCRIPTION_REQUEST_STATUSES.has(rawStatus)
      ? rawStatus
      : "PENDING_PAYMENT") as MobileManualSubscriptionRequest["status"],
    ...(typeof value.workflowStatus === "string"
      ? { workflowStatus: value.workflowStatus }
      : {}),
    ...(value.paymentMethod === "BANK_TRANSFER"
      ? { paymentMethod: "BANK_TRANSFER" as const }
      : {}),
    billingPeriod: (BILLING_INTERVALS.has(rawBillingPeriod)
      ? rawBillingPeriod
      : "MONTHLY") as MobileManualSubscriptionRequest["billingPeriod"],
    amount:
      typeof value.amount === "number"
        ? String(value.amount)
        : asString(value.amount, "0"),
    currency: asString(value.currency, "TRY"),
    planCode: (PURCHASABLE_PLAN_CODES.has(rawPlanCode)
      ? rawPlanCode
      : "STARTER") as MobileManualSubscriptionRequest["planCode"],
    planName: asString(value.planName),
    planSnapshot: {
      accountLimit: asNumber(planSnapshot.accountLimit),
      whatsappConnectionLimit: asNumber(
        planSnapshot.whatsappConnectionLimit,
      ),
      features: {
        brandingFooter: asBoolean(planFeatures.brandingFooter),
      },
    },
    buyerSnapshot: {
      ...(typeof buyerSnapshot.firstName === "string"
        ? { firstName: buyerSnapshot.firstName }
        : {}),
      ...(typeof buyerSnapshot.lastName === "string"
        ? { lastName: buyerSnapshot.lastName }
        : {}),
      ...(typeof buyerSnapshot.name === "string"
        ? { name: buyerSnapshot.name }
        : {}),
      ...(typeof buyerSnapshot.email === "string"
        ? { email: buyerSnapshot.email }
        : {}),
      phone: asNullableString(buyerSnapshot.phone),
      ...(typeof buyerSnapshot.address === "string"
        ? { address: buyerSnapshot.address }
        : {}),
      taxOffice: asNullableString(buyerSnapshot.taxOffice),
      taxNumber: asNullableString(buyerSnapshot.taxNumber),
    },
    seller: normalizeSeller(value.seller, checkout.seller),
    bank: normalizeBank(value.bank, checkout.bank),
    paymentReference: asString(value.paymentReference, publicId),
    transferDescription: asString(
      value.transferDescription,
      asString(buyerSnapshot.email, publicId),
    ),
    customerNote: asNullableString(value.customerNote),
    adminCustomerNote: asNullableString(value.adminCustomerNote),
    legalDocuments: Array.isArray(value.legalDocuments)
      ? value.legalDocuments.flatMap((document) => {
          const normalized = normalizeLegalDocument(document);
          return normalized ? [normalized] : [];
        })
      : [],
    canCancel: asBoolean(value.canCancel),
    createdAt: asString(value.createdAt),
    updatedAt: asString(value.updatedAt),
    expiresAt: asNullableString(value.expiresAt),
  };
}

function normalizeSubscriptionEntitlements(
  value: unknown,
): MobileSubscription["entitlements"] {
  const source = isRecord(value) ? value : {};

  return {
    accountAccess: asBoolean(source.accountAccess),
    support: asBoolean(source.support),
    whatsappConnect: asBoolean(source.whatsappConnect),
    groupSync: asBoolean(source.groupSync),
    categoryManagement: asBoolean(source.categoryManagement),
    groupMessaging: asBoolean(source.groupMessaging),
    contactMessaging: asBoolean(source.contactMessaging),
    messageSend: asBoolean(source.messageSend),
    scheduledMessages: asBoolean(source.scheduledMessages),
    recurringMessages: asBoolean(source.recurringMessages),
    messageHistory: asBoolean(source.messageHistory),
    deleteForEveryone: asBoolean(source.deleteForEveryone),
    deleteForMe: asBoolean(source.deleteForMe),
    platformDelete: asBoolean(source.platformDelete),
    adFreeMessaging: asBoolean(source.adFreeMessaging),
    messageBrandingRequired: asBoolean(source.messageBrandingRequired),
    teamSeats: asNumber(source.teamSeats),
    whatsappConnections: asNumber(source.whatsappConnections),
  };
}

function normalizeSubscriptionLimits(
  value: unknown,
): MobileSubscription["limits"] {
  if (!isRecord(value)) {
    return null;
  }

  return {
    maxWhatsappAccounts: asNumber(value.maxWhatsappAccounts),
    maxTeamUsers: asNumber(value.maxTeamUsers),
    maxGroups: asNumber(value.maxGroups),
    maxMessagesPerDay: asNumber(value.maxMessagesPerDay),
    maxMessagesPerMonth: asNumber(value.maxMessagesPerMonth),
    hasScheduledMessages: asBoolean(value.hasScheduledMessages),
    hasRecurringMessages: asBoolean(value.hasRecurringMessages),
    advancedReportingEnabled: asBoolean(value.advancedReportingEnabled),
    hasNoBranding: asBoolean(value.hasNoBranding),
    hasCrm: asBoolean(value.hasCrm),
    hasApi: asBoolean(value.hasApi),
    groupMessagingEnabled: asBoolean(value.groupMessagingEnabled),
    contactMessagingEnabled: asBoolean(value.contactMessagingEnabled),
    deleteForEveryoneEnabled: asBoolean(value.deleteForEveryoneEnabled),
  };
}

function normalizeSubscription(value: unknown): MobileSubscription | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    planName: asNullableString(value.planName),
    planSlug: asNullableString(value.planSlug),
    status: asString(value.status),
    billingPeriod: asNullableString(value.billingPeriod),
    startsAt: asNullableString(value.startsAt),
    endsAt: asNullableString(value.endsAt),
    trialStartsAt: asNullableString(value.trialStartsAt),
    trialEndsAt: asNullableString(value.trialEndsAt),
    trialDurationDays: asNumber(value.trialDurationDays),
    remainingDays: asNumber(value.remainingDays),
    isTrial: asBoolean(value.isTrial),
    isActive: asBoolean(value.isActive),
    isExpired: asBoolean(value.isExpired),
    limits: normalizeSubscriptionLimits(value.limits),
    entitlements: normalizeSubscriptionEntitlements(value.entitlements),
    lockedFeatures: Array.isArray(value.lockedFeatures)
      ? value.lockedFeatures.filter(
          (feature): feature is string => typeof feature === "string",
        )
      : [],
    upgradeRequired: asBoolean(value.upgradeRequired),
  };
}

function normalizeCompanyEntitlements(
  value: unknown,
): MobileCompanyEntitlementSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    planCode: asNullableString(value.planCode),
    planName: asNullableString(value.planName),
    subscriptionStatus: asString(value.subscriptionStatus),
    isActive: asBoolean(value.isActive),
    seatLimit: asNumber(value.seatLimit),
    seatsUsed: asNumber(value.seatsUsed),
    pendingInviteSeats: asNumber(value.pendingInviteSeats),
    availableSeats: asNumber(value.availableSeats),
    whatsappConnectionLimit: asNumber(value.whatsappConnectionLimit),
    whatsappConnectionsUsed: asNumber(value.whatsappConnectionsUsed),
    whatsappConnectionsAvailable: asNumber(value.whatsappConnectionsAvailable),
    canManageBilling: asBoolean(value.canManageBilling),
    canManageTeam: asBoolean(value.canManageTeam),
    canInviteMembers: asBoolean(value.canInviteMembers),
    canConnectWhatsApp: asBoolean(value.canConnectWhatsApp),
    trialEligibilityStatus: asNullableString(value.trialEligibilityStatus),
    trialDecisionCode: asNullableString(value.trialDecisionCode),
    emailVerificationRequired: asBoolean(value.emailVerificationRequired),
  };
}

function normalizeMembershipAccess(
  value: unknown,
): MobileMembershipAccess | null {
  if (!isRecord(value)) {
    return null;
  }

  const owner = isRecord(value.subscriptionOwner)
    ? {
        id: asString(value.subscriptionOwner.id),
        name: asString(value.subscriptionOwner.name),
        email: asString(value.subscriptionOwner.email),
      }
    : null;
  const plan = isRecord(value.plan)
    ? {
        code: asString(value.plan.code),
        name: asString(value.plan.name),
        startsAt: asNullableString(value.plan.startsAt),
        endsAt: asNullableString(value.plan.endsAt),
        remainingDays: asNumber(value.plan.remainingDays),
        accountLimit: asNumber(value.plan.accountLimit),
      }
    : null;
  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};

  return {
    membershipId: asString(value.membershipId),
    lifecycleState: asString(
      value.lifecycleState,
      "ACTIVE_SHARED_MEMBER",
    ) as MobileMembershipAccess["lifecycleState"],
    sharedAccess: asBoolean(value.sharedAccess),
    sharedAccessExpired: asBoolean(value.sharedAccessExpired),
    subscriptionActive: asBoolean(value.subscriptionActive),
    subscriptionOwner: owner,
    plan,
    capabilities: {
      "tenant.members.read": asBoolean(capabilities["tenant.members.read"]),
      "tenant.members.create": asBoolean(capabilities["tenant.members.create"]),
      "tenant.members.manage_pending": asBoolean(
        capabilities["tenant.members.manage_pending"],
      ),
      "tenant.members.manage_activated": asBoolean(
        capabilities["tenant.members.manage_activated"],
      ),
      "tenant.subscription.read": asBoolean(
        capabilities["tenant.subscription.read"],
      ),
      "tenant.subscription.manage": asBoolean(
        capabilities["tenant.subscription.manage"],
      ),
      "personal.subscription.request": asBoolean(
        capabilities["personal.subscription.request"],
      ),
      "membership.self_delete": asBoolean(
        capabilities["membership.self_delete"],
      ),
      "tenant.delete": asBoolean(capabilities["tenant.delete"]),
    },
  };
}

function normalizePlan(value: unknown): MobilePlanCatalogItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = asString(value.code);
  const slug = asString(value.slug);
  if (!PLAN_CODES.has(code) || !PLAN_SLUGS.has(slug)) {
    return null;
  }

  const limits = isRecord(value.limits) ? value.limits : {};
  const features = isRecord(value.features) ? value.features : {};
  const marketingFeatures = isRecord(value.marketingFeatures)
    ? value.marketingFeatures
    : {};
  const marketingDescription = isRecord(value.marketingDescription)
    ? value.marketingDescription
    : {};
  const marketingSummaryGroups = isRecord(value.marketingSummaryGroups)
    ? value.marketingSummaryGroups
    : {};
  const seatClarification = isRecord(value.seatClarification)
    ? value.seatClarification
    : {};

  const normalizeSummaryGroups = (groups: unknown) =>
    Array.isArray(groups)
      ? groups.flatMap((group) => {
          if (!isRecord(group)) return [];
          const title = asString(group.title).trim();
          const description = asString(group.description).trim();
          return title && description ? [{ title, description }] : [];
        })
      : [];

  return {
    id: asString(value.id),
    code: code as MobilePlanCatalogItem["code"],
    slug: slug as MobilePlanCatalogItem["slug"],
    currency: asString(value.currency, "TRY"),
    monthlyPrice: asNumber(value.monthlyPrice),
    yearlyPrice: asNumber(value.yearlyPrice),
    yearlyMonthlyEquivalent: asNumber(value.yearlyMonthlyEquivalent),
    trialDays: asNumber(value.trialDays),
    limits: {
      accounts: asNumber(limits.accounts),
      whatsappConnections: asNumber(limits.whatsappConnections),
    },
    features: {
      contactMessaging: asBoolean(features.contactMessaging),
      groupMessaging: asBoolean(features.groupMessaging),
      scheduledMessaging: asBoolean(features.scheduledMessaging),
      recurringMessaging: asBoolean(features.recurringMessaging),
      deleteForEveryone: asBoolean(features.deleteForEveryone),
      advancedSupport: asBoolean(features.advancedSupport),
      brandingFooter: asBoolean(features.brandingFooter),
    },
    featureCodes: Array.isArray(value.featureCodes)
      ? value.featureCodes.filter(
          (feature): feature is MobilePlanCatalogItem["featureCodes"][number] =>
            typeof feature === "string" && FEATURE_CODES.has(feature),
        )
      : [],
    marketingDescription: {
      tr: asString(marketingDescription.tr),
      en: asString(marketingDescription.en),
    },
    marketingSummaryGroups: {
      tr: normalizeSummaryGroups(marketingSummaryGroups.tr),
      en: normalizeSummaryGroups(marketingSummaryGroups.en),
    },
    seatClarification: {
      tr: asString(seatClarification.tr),
      en: asString(seatClarification.en),
    },
    marketingFeatures: {
      tr: Array.isArray(marketingFeatures.tr)
        ? marketingFeatures.tr.filter(
            (feature): feature is string => typeof feature === "string",
          )
        : [],
      en: Array.isArray(marketingFeatures.en)
        ? marketingFeatures.en.filter(
            (feature): feature is string => typeof feature === "string",
          )
        : [],
    },
    billingIntervals: Array.isArray(value.billingIntervals)
      ? value.billingIntervals.filter(
          (
            interval,
          ): interval is MobilePlanCatalogItem["billingIntervals"][number] =>
            typeof interval === "string" && BILLING_INTERVALS.has(interval),
        )
      : [],
    active: asBoolean(value.active),
    sortOrder: asNumber(value.sortOrder),
  };
}

export function normalizeMfaStatus(payload: unknown): MfaStatus {
  const source = isRecord(payload) ? payload : {};
  const methods = Array.isArray(source.methods)
    ? source.methods.flatMap((method) => {
        if (!isRecord(method)) {
          return [];
        }

        const type = asString(method.type);
        if (!MFA_METHOD_TYPES.has(type as MfaMethodType)) {
          return [];
        }

        const enabled = asBoolean(method.enabled);
        const status = asString(
          method.status,
          enabled ? "ENABLED" : "DISABLED",
        );

        return [
          {
            type: type as MfaMethodType,
            status: (MFA_METHOD_STATUSES.has(status)
              ? status
              : enabled
                ? "ENABLED"
                : "DISABLED") as MfaStatus["methods"][number]["status"],
            enabled,
            preferred: asBoolean(method.preferred),
            enabledAt: asNullableString(method.enabledAt),
          },
        ];
      })
    : [];

  const preferredMethod = asString(source.preferredMethod);

  return {
    enabled: asBoolean(source.enabled),
    enabledAt: asNullableString(source.enabledAt),
    setupInProgress: asBoolean(source.setupInProgress),
    setupExpiresAt: asNullableString(source.setupExpiresAt),
    verifiedEmail: asString(source.verifiedEmail),
    preferredMethod: MFA_METHOD_TYPES.has(preferredMethod as MfaMethodType)
      ? (preferredMethod as MfaMethodType)
      : null,
    methods,
  };
}

export function normalizeMobileSubscriptionResponse(payload: unknown): {
  subscription: MobileSubscription | null;
  entitlements: MobileCompanyEntitlementSummary | null;
  plans: MobilePlanCatalogItem[];
  membershipAccess: MobileMembershipAccess | null;
} {
  const source = isRecord(payload) ? payload : {};

  return {
    subscription: normalizeSubscription(source.subscription),
    entitlements: normalizeCompanyEntitlements(source.entitlements),
    membershipAccess: normalizeMembershipAccess(source.membershipAccess),
    plans: Array.isArray(source.plans)
      ? source.plans.flatMap((plan) => {
          const normalized = normalizePlan(plan);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export function normalizeMobileSubscriptionCheckout(
  payload: unknown,
): MobileManualSubscriptionCheckout {
  const source = isRecord(payload) ? payload : {};
  const seller = isRecord(source.seller)
    ? normalizeSeller(source.seller)
    : null;
  const bank = isRecord(source.bank)
    ? normalizeBank(source.bank)
    : null;

  return {
    checkoutAvailable: asBoolean(source.checkoutAvailable),
    missingSellerFields: Array.isArray(source.missingSellerFields)
      ? source.missingSellerFields.filter(
          (field): field is string => typeof field === "string",
        )
      : [],
    bank,
    seller,
  };
}

export function selectLatestMobileSubscriptionRequest(
  requests: MobileManualSubscriptionRequest[],
): MobileManualSubscriptionRequest | null {
  return (
    [...requests].sort((left, right) => {
      const leftCreatedAt = Date.parse(left.createdAt);
      const rightCreatedAt = Date.parse(right.createdAt);
      const normalizedLeftCreatedAt = Number.isFinite(leftCreatedAt)
        ? leftCreatedAt
        : Number.NEGATIVE_INFINITY;
      const normalizedRightCreatedAt = Number.isFinite(rightCreatedAt)
        ? rightCreatedAt
        : Number.NEGATIVE_INFINITY;
      const createdAtOrder =
        normalizedRightCreatedAt - normalizedLeftCreatedAt;

      if (createdAtOrder !== 0) return createdAtOrder;
      if (left.id === right.id) return 0;
      return left.id < right.id ? 1 : -1;
    })[0] ?? null
  );
}

export function normalizeMobileSubscriptionRequestsResponse(payload: unknown): {
  requests: MobileManualSubscriptionRequest[];
  checkout: MobileManualSubscriptionCheckout;
} {
  const source = isRecord(payload) ? payload : {};
  const checkout = normalizeMobileSubscriptionCheckout(source.checkout);
  const requests = Array.isArray(source.requests)
    ? source.requests.flatMap((request) => {
        const normalized = normalizeManualSubscriptionRequest(
          request,
          checkout,
        );
        return normalized ? [normalized] : [];
      })
    : [];
  const latestRequest = selectLatestMobileSubscriptionRequest(requests);

  return {
    requests: latestRequest ? [latestRequest] : [],
    checkout,
  };
}

export function normalizeMobileSubscriptionDraftResponse(payload: unknown): {
  draft: MobileManualSubscriptionRequest | null;
  correlationId: string | null;
} {
  const source = isRecord(payload) ? payload : {};
  const checkout = normalizeMobileSubscriptionCheckout(source.checkout);
  return {
    draft: normalizeManualSubscriptionRequest(source.draft, checkout),
    correlationId: asNullableString(source.correlationId),
  };
}

export function normalizeMobileSubscriptionSubmitResponse(payload: unknown): {
  request: MobileManualSubscriptionRequest | null;
  message: string;
  duplicate: boolean;
} {
  const source = isRecord(payload) ? payload : {};
  const checkout = normalizeMobileSubscriptionCheckout(source.checkout);
  return {
    request: normalizeManualSubscriptionRequest(source.request, checkout),
    message: asString(source.message),
    duplicate: asBoolean(source.duplicate),
  };
}

export function normalizeMobileSubscriptionCheckoutEligibility(
  payload: unknown,
): MobileSubscriptionCheckoutEligibility {
  const source = isRecord(payload) ? payload : {};
  const customer = isRecord(source.customer) ? source.customer : null;
  const identitySource = asString(source.identitySource);

  return {
    eligible: asBoolean(source.eligible),
    missingFields: Array.isArray(source.missingFields)
      ? source.missingFields.filter(
          (
            field,
          ): field is MobileSubscriptionCheckoutEligibility["missingFields"][number] =>
            typeof field === "string"
            && CHECKOUT_PROFILE_ERROR_CODES.has(field),
        )
      : [],
    blockerCode: asNullableString(source.blockerCode),
    customer: customer
      ? {
          firstName: asString(customer.firstName),
          lastName: asString(customer.lastName),
          fullName: asString(customer.fullName),
          email: asString(customer.email),
          phone: asNullableString(customer.phone),
          address: asNullableString(customer.address),
        }
      : null,
    ...(
      identitySource === "SEPARATE_FIELDS"
      || identitySource === "LEGACY_FULL_NAME"
      || identitySource === "INCOMPLETE"
    )
      ? { identitySource }
      : {},
    ...(typeof source.correlationId === "string"
      ? { correlationId: source.correlationId }
      : {}),
  };
}
