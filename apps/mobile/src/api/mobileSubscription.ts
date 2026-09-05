import { apiClient } from "@/api/client";
import {
  normalizeMobileSubscriptionCheckoutEligibility,
  normalizeMobileSubscriptionDraftResponse,
  normalizeMobileSubscriptionRequestsResponse,
  normalizeMobileSubscriptionResponse,
  normalizeMobileSubscriptionSubmitResponse,
} from "@/api/mobile-response-normalizers";
import { translateCurrent } from "@/i18n/runtime";

export type MobileSubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELED"
  | "CANCELLED"
  | "PAST_DUE"
  | string;

export type MobileSubscription = {
  planName: string | null;
  planSlug: string | null;
  status: MobileSubscriptionStatus;
  billingPeriod: string | null;
  startsAt: string | null;
  endsAt: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialDurationDays: number;
  remainingDays: number;
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  limits: {
    maxWhatsappAccounts: number;
    maxTeamUsers: number;
    maxGroups: number;
    maxMessagesPerDay: number;
    maxMessagesPerMonth: number;
    hasScheduledMessages?: boolean;
    hasRecurringMessages?: boolean;
    advancedReportingEnabled?: boolean;
    hasNoBranding?: boolean;
    hasCrm?: boolean;
    hasApi?: boolean;
    groupMessagingEnabled?: boolean;
    contactMessagingEnabled?: boolean;
    deleteForEveryoneEnabled?: boolean;
  } | null;
  entitlements: {
    accountAccess: boolean;
    support: boolean;
    whatsappConnect: boolean;
    groupSync: boolean;
    categoryManagement: boolean;
    groupMessaging: boolean;
    contactMessaging: boolean;
    messageSend: boolean;
    scheduledMessages: boolean;
    recurringMessages: boolean;
    messageHistory: boolean;
    deleteForEveryone: boolean;
    deleteForMe: boolean;
    platformDelete: boolean;
    adFreeMessaging: boolean;
    messageBrandingRequired: boolean;
    teamSeats: number;
    whatsappConnections: number;
  };
  lockedFeatures: string[];
  upgradeRequired: boolean;
};

export type MobileCompanyEntitlementSummary = {
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string;
  isActive: boolean;
  seatLimit: number;
  seatsUsed: number;
  pendingInviteSeats: number;
  availableSeats: number;
  whatsappConnectionLimit: number;
  whatsappConnectionsUsed: number;
  whatsappConnectionsAvailable: number;
  canManageBilling: boolean;
  canManageTeam: boolean;
  canInviteMembers: boolean;
  canConnectWhatsApp: boolean;
  trialEligibilityStatus: string | null;
  trialDecisionCode: string | null;
  emailVerificationRequired: boolean;
};

export type MobileMembershipAccess = {
  membershipId: string;
  lifecycleState:
    | "PENDING_ACTIVATION"
    | "ACTIVE_SHARED_MEMBER"
    | "SUSPENDED_FOR_SECURITY"
    | "SHARED_SUBSCRIPTION_EXPIRED"
    | "DETACHED"
    | "INDEPENDENT_OWNER"
    | "REMOVED_BEFORE_ACTIVATION";
  sharedAccess: boolean;
  sharedAccessExpired: boolean;
  subscriptionActive: boolean;
  subscriptionOwner: {
    id: string;
    name: string;
    email: string;
  } | null;
  plan: {
    code: string;
    name: string;
    startsAt: string | null;
    endsAt: string | null;
    remainingDays: number;
    accountLimit: number;
  } | null;
  capabilities: {
    "tenant.members.read": boolean;
    "tenant.members.create": boolean;
    "tenant.members.manage_pending": boolean;
    "tenant.members.manage_activated": boolean;
    "tenant.subscription.read": boolean;
    "tenant.subscription.manage": boolean;
    "personal.subscription.request": boolean;
    "membership.self_delete": boolean;
    "tenant.delete": boolean;
  };
};

export type MobilePlanCatalogItem = {
  id: string;
  code: "TRIAL" | "STARTER" | "PROFESSIONAL";
  slug: "trial" | "starter" | "professional";
  currency: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyMonthlyEquivalent: number;
  trialDays: number;
  limits: { accounts: number; whatsappConnections: number };
  features: {
    contactMessaging: boolean;
    groupMessaging: boolean;
    scheduledMessaging: boolean;
    recurringMessaging: boolean;
    deleteForEveryone: boolean;
    advancedSupport: boolean;
    brandingFooter: boolean;
  };
  featureCodes: Array<
    | "ACCOUNT_ALLOWANCE"
    | "BRANDED_MESSAGING"
    | "UNBRANDED_MESSAGING"
    | "CONTACT_MESSAGING"
    | "GROUP_MESSAGING"
    | "SCHEDULED_RECURRING"
    | "DELETE_FOR_EVERYONE"
    | "ADVANCED_SUPPORT"
    | "TRIAL_DURATION"
  >;
  marketingDescription: { tr: string; en: string };
  marketingSummaryGroups: {
    tr: Array<{ title: string; description: string }>;
    en: Array<{ title: string; description: string }>;
  };
  seatClarification: { tr: string; en: string };
  marketingFeatures: { tr: string[]; en: string[] };
  billingIntervals: Array<"MONTHLY" | "YEARLY">;
  active: boolean;
  sortOrder: number;
};

export type ApplePurchaseContext = {
  canPurchase: boolean;
  appAccountToken: string | null;
  productIds: string[];
  reason: string | null;
};

export type ApplePurchaseActivation = {
  active: boolean;
  idempotent: boolean;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  subscriptionId: string;
  status: string;
  endsAt: string;
};

export type GooglePlayPurchaseContext = {
  canPurchase: boolean;
  productIds: string[];
  obfuscatedAccountId: string | null;
  obfuscatedProfileId: string | null;
  reason: string | null;
};

export type GooglePlayPurchaseActivation = {
  active: boolean;
  idempotent: boolean;
  productId: string;
  basePlanId: string;
  orderId: string;
  subscriptionId: string;
  status: string;
  endsAt: string;
  acknowledged: boolean;
};

export type MobileSubscriptionRequestStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_REVIEW"
  | "DRAFT"
  | "AWAITING_PAYMENT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "ACTIVATED"
  | "CLARIFICATION_REQUIRED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type MobileBillingLegalDocument = {
  type:
    | "PRE_INFORMATION_FORM"
    | "DISTANCE_SALES_AGREEMENT"
    | "REFUND_WITHDRAWAL_POLICY";
  title: string;
  version: string;
  hash: string;
  content: string;
};

export type MobileSellerDetails = {
  officialName: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  phone: string;
  tradeRegistryNumber?: string | null;
  mersisNumber?: string | null;
};

export type MobileManualSubscriptionRequest = {
  id: string;
  publicId: string;
  status: MobileSubscriptionRequestStatus;
  workflowStatus?: string;
  paymentMethod?: "BANK_TRANSFER";
  billingPeriod: "MONTHLY" | "YEARLY";
  amount: string;
  currency: string;
  planCode: "STARTER" | "PROFESSIONAL";
  planName: string;
  planSnapshot: {
    accountLimit?: number;
    whatsappConnectionLimit?: number;
    features?: { brandingFooter?: boolean };
  };
  buyerSnapshot: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    phone?: string | null;
    address?: string;
    taxOffice?: string | null;
    taxNumber?: string | null;
  };
  seller: MobileSellerDetails;
  bank: {
    accountHolder: string;
    bankName: string;
    ibanDisplay: string;
    ibanNormalized: string;
  };
  paymentReference: string;
  transferDescription: string;
  customerNote?: string | null;
  adminCustomerNote?: string | null;
  legalDocuments: MobileBillingLegalDocument[];
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
};

export type MobileManualSubscriptionCheckout = {
  checkoutAvailable: boolean;
  missingSellerFields: string[];
  bank: MobileManualSubscriptionRequest["bank"] | null;
  seller: MobileSellerDetails | null;
};

export type MobileSubscriptionCheckoutEligibility = {
  eligible: boolean;
  missingFields: Array<
    | "PROFILE_FIRST_NAME_MISSING"
    | "PROFILE_LAST_NAME_MISSING"
    | "PROFILE_EMAIL_MISSING"
  >;
  blockerCode?: string | null;
  customer: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone?: string | null;
    address?: string | null;
  } | null;
  identitySource?: "SEPARATE_FIELDS" | "LEGACY_FULL_NAME" | "INCOMPLETE";
  correlationId?: string;
};

export type MobileSubscriptionDomainErrorCode =
  "DATA_CONTRACT_INVALID" | "LEGAL_ACCEPTANCE_REQUIRED";

export class MobileSubscriptionDomainError extends Error {
  constructor(
    public readonly code: MobileSubscriptionDomainErrorCode,
    public readonly stage: "load" | "draft" | "submit",
  ) {
    super(
      code === "LEGAL_ACCEPTANCE_REQUIRED"
        ? translateCurrent("billingLegalConsentRequiredError")
        : translateCurrent("invalidServerResponseError"),
    );
    this.name = "MobileSubscriptionDomainError";
  }
}

function requireCheckoutRequest(
  request: MobileManualSubscriptionRequest | null,
  stage: "draft" | "submit",
) {
  if (
    !request ||
    !request.id ||
    !request.publicId ||
    !request.planName ||
    !request.bank.bankName ||
    !request.bank.accountHolder ||
    !request.bank.ibanNormalized
  ) {
    throw new MobileSubscriptionDomainError("DATA_CONTRACT_INVALID", stage);
  }
  if (
    stage === "draft" &&
    (request.legalDocuments.length !== 3 ||
      request.legalDocuments.some(
        (document) => !document.version || !document.hash || !document.content,
      ))
  ) {
    throw new MobileSubscriptionDomainError("LEGAL_ACCEPTANCE_REQUIRED", stage);
  }
  return request;
}

export async function getMobileSubscription() {
  const payload = await apiClient.request<unknown>(
    "/api/mobile/subscription/status",
  );
  return normalizeMobileSubscriptionResponse(payload);
}

export function getApplePurchaseContext() {
  return apiClient.request<ApplePurchaseContext>(
    "/api/mobile/subscription/apple/context",
  );
}

export function verifyApplePurchase(signedTransactionInfo: string) {
  return apiClient.post<ApplePurchaseActivation>(
    "/api/mobile/subscription/apple/transactions",
    { signedTransactionInfo },
  );
}

export function getGooglePlayPurchaseContext() {
  return apiClient.request<GooglePlayPurchaseContext>(
    "/api/mobile/subscription/google-play/context",
  );
}

export function verifyGooglePlayPurchase(input: {
  purchaseToken: string;
  productId: string;
  basePlanId?: string;
}) {
  return apiClient.post<GooglePlayPurchaseActivation>(
    "/api/mobile/subscription/google-play/purchases",
    input,
  );
}

export function resendMobileEmailVerification() {
  return apiClient.post<{ sent?: boolean; alreadyVerified?: boolean }>(
    "/api/mobile/auth/email-verification/resend",
    {},
  );
}

export async function getMobileSubscriptionRequests() {
  const payload = await apiClient.request<unknown>(
    "/api/mobile/subscription/requests",
  );
  return normalizeMobileSubscriptionRequestsResponse(payload);
}

export async function getMobileSubscriptionCheckoutEligibility() {
  const payload = await apiClient.request<unknown>(
    "/api/mobile/subscription/checkout-eligibility",
  );
  return normalizeMobileSubscriptionCheckoutEligibility(payload);
}

export async function createMobileSubscriptionRequestDraft(
  input: {
    planSlug: "starter" | "professional";
    billingPeriod: "MONTHLY" | "YEARLY";
  },
  existingIdempotencyKey?: string,
) {
  const idempotencyKey =
    existingIdempotencyKey ||
    [
      "mobile-subscription",
      input.planSlug,
      input.billingPeriod,
      Date.now().toString(36),
      Math.random().toString(36).slice(2, 12),
    ].join("-");
  const payload = await apiClient.post<unknown>(
    "/api/mobile/subscription/requests",
    { ...input, idempotencyKey },
  );
  const response = normalizeMobileSubscriptionDraftResponse(payload);
  return {
    ...response,
    draft: requireCheckoutRequest(response.draft, "draft"),
  };
}

export async function submitMobileSubscriptionRequest(
  requestId: string,
  acceptedDocuments: Array<
    Pick<MobileBillingLegalDocument, "type" | "version" | "hash">
  >,
) {
  const payload = await apiClient.post<unknown>(
    `/api/mobile/subscription/requests/${requestId}/submit`,
    {
      acceptedDocuments,
      immediatePerformanceConsent: true,
    },
  );
  const response = normalizeMobileSubscriptionSubmitResponse(payload);
  return {
    ...response,
    request: requireCheckoutRequest(response.request, "submit"),
  };
}

export function cancelMobileSubscriptionRequest(requestId: string) {
  return apiClient.post<{ ok: true }>(
    `/api/mobile/subscription/requests/${requestId}/cancel`,
    {},
  );
}
