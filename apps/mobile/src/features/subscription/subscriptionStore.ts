import { create } from "zustand";

import {
  cancelMobileSubscriptionRequest,
  createMobileSubscriptionRequestDraft,
  getMobileSubscriptionCheckoutEligibility,
  getMobileSubscription,
  getMobileSubscriptionRequests,
  resendMobileEmailVerification,
  submitMobileSubscriptionRequest,
  type MobileBillingLegalDocument,
  type MobileCompanyEntitlementSummary,
  type MobileManualSubscriptionCheckout,
  type MobileManualSubscriptionRequest,
  type MobileMembershipAccess,
  type MobilePlanCatalogItem,
  type MobileSubscription,
  MobileSubscriptionDomainError,
} from "@/api/mobileSubscription";
import { ApiRequestError } from "@/api/api-errors";
import { translateCurrent } from "@/i18n/runtime";
import { trackEvent } from "@/services/analytics";

function checkoutEligibilityMessage(code?: string | null) {
  if (code === "PROFILE_FIRST_NAME_MISSING") {
    return translateCurrent("billing.manual.profileFirstNameMissing");
  }
  if (code === "PROFILE_LAST_NAME_MISSING") {
    return translateCurrent("billing.manual.profileLastNameMissing");
  }
  if (code === "PROFILE_EMAIL_MISSING") {
    return translateCurrent("billing.manual.profileEmailMissing");
  }
  if (code === "ACTIVE_SHARED_MEMBERSHIP_EXISTS") {
    return translateCurrent("billing.manual.activeSharedMembership");
  }
  return translateCurrent("subscriptionUpgradeFailed");
}

function subscriptionFailure(error: unknown, stage: string) {
  const code =
    error instanceof MobileSubscriptionDomainError
      ? error.code
      : error instanceof ApiRequestError
        ? error.code
        : "SUBSCRIPTION_REQUEST_FAILED";
  void trackEvent(`${stage}_failed`, { errorCode: code });
  return {
    code,
    message:
      error instanceof Error
        ? error.message
        : translateCurrent("subscriptionUpgradeFailed"),
  };
}

const draftIdempotencyKeys = new Map<string, string>();

function draftAttemptKey(
  planSlug: "starter" | "professional",
  billingPeriod: "MONTHLY" | "YEARLY",
) {
  const selection = `${planSlug}:${billingPeriod}`;
  const existing = draftIdempotencyKeys.get(selection);
  if (existing) return { selection, idempotencyKey: existing };
  const idempotencyKey = [
    "mobile-subscription",
    planSlug,
    billingPeriod,
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 12),
  ].join("-");
  draftIdempotencyKeys.set(selection, idempotencyKey);
  return { selection, idempotencyKey };
}

type SubscriptionState = {
  subscription: MobileSubscription | null;
  entitlements: MobileCompanyEntitlementSummary | null;
  membershipAccess: MobileMembershipAccess | null;
  plans: MobilePlanCatalogItem[];
  requests: MobileManualSubscriptionRequest[];
  checkout: MobileManualSubscriptionCheckout | null;
  draft: MobileManualSubscriptionRequest | null;
  createdRequest: MobileManualSubscriptionRequest | null;
  loading: boolean;
  requesting: boolean;
  resendingVerification: boolean;
  error: string | null;
  success: string | null;
  load: () => Promise<void>;
  createDraft: (
    planSlug: "starter" | "professional",
    billingPeriod: "MONTHLY" | "YEARLY",
  ) => Promise<boolean>;
  submitDraft: (
    acceptedDocuments: Array<
      Pick<MobileBillingLegalDocument, "type" | "version" | "hash">
    >,
  ) => Promise<boolean>;
  cancelRequest: (requestId: string) => Promise<boolean>;
  dismissDraft: () => void;
  dismissCreatedRequest: () => void;
  resendVerification: () => Promise<boolean>;
  reset: () => void;
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  entitlements: null,
  membershipAccess: null,
  plans: [],
  requests: [],
  checkout: null,
  draft: null,
  createdRequest: null,
  loading: false,
  requesting: false,
  resendingVerification: false,
  error: null,
  success: null,
  load: async () => {
    const startedAt = Date.now();
    set({ loading: true, error: null });
    void trackEvent("subscription_screen_open_started");
    try {
      const [subscriptionResult, requestsResult] = await Promise.allSettled([
        getMobileSubscription(),
        getMobileSubscriptionRequests(),
      ]);
      if (subscriptionResult.status === "rejected") {
        throw subscriptionResult.reason;
      }
      const response = subscriptionResult.value;
      const requestResponse =
        requestsResult.status === "fulfilled"
          ? requestsResult.value
          : { requests: [], checkout: null };
      const requestFailure =
        requestsResult.status === "rejected"
          ? subscriptionFailure(
              requestsResult.reason,
              "subscription_requests_load",
            )
          : null;
      set({
        subscription: response.subscription,
        entitlements: response.entitlements,
        membershipAccess: response.membershipAccess,
        plans: response.plans,
        requests: requestResponse.requests,
        checkout: requestResponse.checkout,
        error: requestFailure?.message ?? null,
        loading: false,
      });
      void trackEvent("subscription_screen_open_succeeded", {
        durationMs: Date.now() - startedAt,
        requestCount: requestResponse.requests.length,
        planCount: response.plans.length,
      });
    } catch (error) {
      const failure = subscriptionFailure(
        error,
        "subscription_screen_open",
      );
      set({
        subscription: null,
        entitlements: null,
        membershipAccess: null,
        plans: [],
        requests: [],
        checkout: null,
        error: failure.message || translateCurrent("subscriptionLoadFailed"),
        loading: false,
      });
    }
  },
  createDraft: async (planSlug, billingPeriod) => {
    if (get().requesting) return false;
    set({ requesting: true, error: null, success: null });
    void trackEvent("subscription_plan_selected", {
      planSlug,
      billingPeriod,
    });
    void trackEvent("subscription_request_started", {
      stage: "draft",
      planSlug,
      billingPeriod,
    });
    try {
      const attempt = draftAttemptKey(planSlug, billingPeriod);
      const eligibility =
        await getMobileSubscriptionCheckoutEligibility();
      if (!eligibility.eligible) {
        draftIdempotencyKeys.delete(attempt.selection);
        set({
          requesting: false,
          error: checkoutEligibilityMessage(
            eligibility.blockerCode || eligibility.missingFields[0],
          ),
        });
        return false;
      }
      const response = await createMobileSubscriptionRequestDraft({
        planSlug,
        billingPeriod,
      }, attempt.idempotencyKey);
      draftIdempotencyKeys.delete(attempt.selection);
      set({ requesting: false, draft: response.draft });
      void trackEvent("subscription_request_succeeded", {
        stage: "draft",
        planSlug,
        billingPeriod,
      });
      return true;
    } catch (error) {
      const failure = subscriptionFailure(
        error,
        "subscription_request",
      );
      set({
        requesting: false,
        error: failure.message,
      });
      return false;
    }
  },
  submitDraft: async (acceptedDocuments) => {
    if (get().requesting) return false;
    const draft = get().draft;
    if (!draft) return false;
    set({ requesting: true, error: null, success: null });
    void trackEvent("subscription_request_started", { stage: "submit" });
    try {
      const response = await submitMobileSubscriptionRequest(
        draft.id,
        acceptedDocuments,
      );
      set({
        requesting: false,
        draft: null,
        createdRequest: response.request,
        success: response.message,
      });
      void trackEvent("subscription_request_succeeded", {
        stage: "submit",
        duplicate: response.duplicate,
      });
      void trackEvent("subscription_bank_details_displayed");
      await get().load();
      return true;
    } catch (error) {
      const failure = subscriptionFailure(
        error,
        "subscription_request",
      );
      set({
        requesting: false,
        error: failure.message,
      });
      return false;
    }
  },
  cancelRequest: async (requestId) => {
    set({ requesting: true, error: null, success: null });
    try {
      await cancelMobileSubscriptionRequest(requestId);
      set({
        requesting: false,
        success: "Abonelik talebiniz iptal edildi.",
      });
      await get().load();
      return true;
    } catch (error) {
      set({
        requesting: false,
        error:
          error instanceof Error
            ? error.message
            : translateCurrent("operationFailedError"),
      });
      return false;
    }
  },
  dismissDraft: () => set({ draft: null, error: null }),
  dismissCreatedRequest: () => set({ createdRequest: null }),
  resendVerification: async () => {
    set({ resendingVerification: true, error: null, success: null });
    try {
      const response = await resendMobileEmailVerification();
      set({
        resendingVerification: false,
        success: response.alreadyVerified
          ? translateCurrent("emailAlreadyVerified")
          : translateCurrent("verificationEmailSent"),
      });
      await get().load();
      return true;
    } catch (error) {
      set({
        resendingVerification: false,
        error:
          error instanceof Error
            ? error.message
            : translateCurrent("operationFailedError"),
      });
      return false;
    }
  },
  reset: () =>
    set({
      subscription: null,
      entitlements: null,
      membershipAccess: null,
      plans: [],
      requests: [],
      checkout: null,
      draft: null,
      createdRequest: null,
      loading: false,
      requesting: false,
      resendingVerification: false,
      error: null,
      success: null,
    }),
}));
