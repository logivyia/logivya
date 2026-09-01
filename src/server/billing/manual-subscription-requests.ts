import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type {
  BillingProvider,
  BillingPeriod,
  CompanyBillingProfile,
  Prisma,
  SubscriptionRequestPurpose,
  SubscriptionRequestStatus,
} from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";

import {
  CANONICAL_SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
  type PurchasableSubscriptionPlanCode,
} from "@/config/subscription-plans";
import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { getSubscriptionCheckoutEligibility } from "@/server/billing/checkout-eligibility";
import type { CheckoutProfileErrorCode } from "@/server/billing/checkout-identity";
import {
  BILLING_LEGAL_DOCUMENT_TYPES,
  LOGIVYA_BANK_CONFIGURATION_VERSION,
  LOGIVYA_BANK_TRANSFER,
  LOGIVYA_SELLER_DISPLAY_NAME,
  billingSellerConfigurationState,
  buildLogivyaBillingLegalDocuments,
  publicSellerIdentity,
  type BillingLegalDocument,
  type BillingLegalDocumentTypeCode,
  type PublicSellerIdentity,
} from "@/server/billing/manual-subscription-config";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { requestNetworkSummary } from "@/server/observability/privacy";
import { hashIdempotencyValue } from "@/server/security/idempotency";

const REQUEST_EXPIRY_DAYS = 7;
const CANCELLABLE_STATUSES: SubscriptionRequestStatus[] = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "CLARIFICATION_REQUIRED",
];
const REVIEWABLE_STATUSES: SubscriptionRequestStatus[] = [
  "AWAITING_PAYMENT",
  "CLARIFICATION_REQUIRED",
];
const REJECTABLE_STATUSES: SubscriptionRequestStatus[] = [
  "AWAITING_PAYMENT",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUIRED",
];
const ACTIVE_REQUEST_STATUSES: SubscriptionRequestStatus[] = [
  "DRAFT",
  "AWAITING_PAYMENT",
  "UNDER_REVIEW",
  "CLARIFICATION_REQUIRED",
];

export class ManualSubscriptionRequestError extends Error {
  constructor(
    code: string,
    public readonly status = 400,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ManualSubscriptionRequestError";
  }
}

function throwCheckoutEligibilityError(input: {
  blockerCode: string | null;
  missingFields: CheckoutProfileErrorCode[];
}) {
  if (input.blockerCode === "ACTIVE_SHARED_MEMBERSHIP_EXISTS") {
    throw new ManualSubscriptionRequestError(
      "ACTIVE_SHARED_MEMBERSHIP_EXISTS",
      409,
    );
  }
  if (input.blockerCode) {
    throw new ManualSubscriptionRequestError(input.blockerCode, 403);
  }
  if (input.missingFields.length) {
    throw new ManualSubscriptionRequestError(
      input.missingFields[0],
      400,
      { missingFields: input.missingFields },
    );
  }
}

type DraftContext = {
  company: { id: string; name: string; email: string | null; phone: string | null; address: string | null; taxOffice: string | null; taxNumber: string | null };
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    locale: string;
    country?: string;
  };
};

type AcceptedDocument = {
  type: BillingLegalDocumentTypeCode;
  version: string;
  hash: string;
};

type RequestWithDetails = Prisma.SubscriptionRequestGetPayload<{
  include: {
    requestedBy: { select: { id: true; name: true; email: true; phone: true } };
    reviewedBy: { select: { id: true; name: true; email: true } };
    activationSubscription: { include: { plan: true } };
    consents: true;
    transitions: {
      include: { actorUser: { select: { id: true; name: true; email: true } } };
    };
  };
}>;

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function compactId(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${date}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function requestFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function activeRequestKey(scope: string) {
  return createHash("sha256")
    .update(`manual-subscription-active:${scope}`, "utf8")
    .digest("hex");
}

function money(amountMinor: number) {
  return new PrismaRuntime.Decimal(amountMinor).div(100);
}

function billingPeriodLabel(period: BillingPeriod) {
  return period === "YEARLY" ? "Yıllık" : "Aylık";
}

function amountLabel(amount: Prisma.Decimal | string | number, currency: string) {
  return `${Number(amount).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function buyerSnapshot(
  context: DraftContext,
  customer: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string | null;
    address: string | null;
  },
  profile: CompanyBillingProfile | null,
) {
  const personalProfile = profile?.billingType === "INDIVIDUAL" ? profile : null;
  return {
    billingType: "INDIVIDUAL",
    firstName: customer.firstName,
    lastName: customer.lastName,
    name: customer.fullName || context.user.name,
    email: personalProfile?.billingEmail || customer.email,
    phone: personalProfile?.billingPhone || customer.phone,
    address: customer.address,
    taxOffice: null,
    taxNumber: null,
    nationalIdNumber: personalProfile?.nationalIdNumber || null,
    companyName: null,
    tradeName: null,
  };
}

function independentBuyerSnapshot(
  context: DraftContext,
  customer: {
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string | null;
    address: string | null;
  },
) {
  return {
    billingType: "INDIVIDUAL",
    firstName: customer.firstName,
    lastName: customer.lastName,
    name: customer.fullName || context.user.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    country: context.user.country || "TR",
    taxOffice: null,
    taxNumber: null,
    nationalIdNumber: null,
    companyName: null,
    tradeName: null,
    source: "SHARED_MEMBER_SELF",
  };
}

function planSnapshot(planCode: PurchasableSubscriptionPlanCode) {
  const plan = CANONICAL_SUBSCRIPTION_PLANS[planCode];
  return {
    pricingConfigVersion: SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
    code: plan.code,
    slug: plan.slug,
    currency: plan.currency,
    monthlyPriceMinor: plan.monthlyPriceMinor,
    yearlyPriceMinor: plan.yearlyPriceMinor,
    accountLimit: plan.accountLimit,
    whatsappConnectionLimit: plan.whatsappConnectionLimit,
    features: { ...plan.features },
  };
}

function storedObject(value: Prisma.JsonValue, code: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ManualSubscriptionRequestError(code, 500);
  }
  return value as Record<string, unknown>;
}

const LEGACY_LOGIVYA_SELLER: PublicSellerIdentity = {
  officialName: LOGIVYA_SELLER_DISPLAY_NAME,
  taxOffice: "",
  taxNumber: "",
  email: "",
  phone: "",
  tradeRegistryNumber: null,
  mersisNumber: null,
};

function storedSeller(
  value: Prisma.JsonValue,
  fallback: PublicSellerIdentity = LEGACY_LOGIVYA_SELLER,
): PublicSellerIdentity {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return fallback;
  }
  const seller = value as Record<string, unknown>;
  const required = ["taxOffice", "taxNumber", "email", "phone"] as const;
  for (const field of required) {
    if (typeof seller[field] !== "string" || !seller[field]) {
      return fallback;
    }
  }
  return {
    officialName: LOGIVYA_SELLER_DISPLAY_NAME,
    taxOffice: String(seller.taxOffice),
    taxNumber: String(seller.taxNumber),
    email: String(seller.email),
    phone: String(seller.phone),
    tradeRegistryNumber: typeof seller.tradeRegistryNumber === "string" ? seller.tradeRegistryNumber : null,
    mersisNumber: typeof seller.mersisNumber === "string" ? seller.mersisNumber : null,
  };
}

function legalDocumentsForRequest(request: {
  publicId: string;
  buyerSnapshot: Prisma.JsonValue;
  sellerSnapshot: Prisma.JsonValue;
  planName: string;
  billingPeriod: BillingPeriod;
  amount: Prisma.Decimal;
  currency: string;
  paymentReference: string;
  transferDescriptionEmail?: string | null;
}, sellerFallback?: PublicSellerIdentity) {
  const buyer = storedObject(request.buyerSnapshot, "INVALID_BUYER_SNAPSHOT");
  const transferDescription = String(
    request.transferDescriptionEmail || buyer.email || "",
  );
  return buildLogivyaBillingLegalDocuments({
    seller: storedSeller(request.sellerSnapshot, sellerFallback),
    buyerName: String(buyer.name || ""),
    buyerEmail: String(buyer.email || ""),
    buyerAddress: String(buyer.address || ""),
    planName: request.planName,
    billingPeriodLabel: billingPeriodLabel(request.billingPeriod),
    amountLabel: amountLabel(request.amount, request.currency),
    orderReference: request.publicId,
    transferDescription,
  });
}

function verifyAcceptedDocuments(documents: BillingLegalDocument[], accepted: AcceptedDocument[]) {
  const acceptedByType = new Map(accepted.map((document) => [document.type, document]));
  for (const required of documents) {
    const provided = acceptedByType.get(required.type);
    if (!provided || provided.version !== required.version || provided.hash !== required.hash) {
      throw new ManualSubscriptionRequestError("LEGAL_CONSENT_REQUIRED", 400, {
        documentType: required.type,
      });
    }
  }
  if (accepted.length !== BILLING_LEGAL_DOCUMENT_TYPES.length) {
    throw new ManualSubscriptionRequestError("LEGAL_CONSENT_REQUIRED");
  }
}

export async function getBillingCheckoutConfiguration() {
  const configuration = await prisma.billingSellerConfiguration.findUnique({ where: { id: "logivya" } });
  const state = billingSellerConfigurationState(configuration);
  return {
    checkoutAvailable: state.checkoutAvailable,
    missingSellerFields: state.missingFields,
    pricingConfigVersion: SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
    bankConfigVersion: LOGIVYA_BANK_CONFIGURATION_VERSION,
    bank: state.checkoutAvailable ? LOGIVYA_BANK_TRANSFER : null,
    seller: configuration && state.checkoutAvailable ? publicSellerIdentity(configuration) : null,
  };
}

export async function createManualSubscriptionDraft(input: {
  planSlug: PurchasableSubscriptionPlanCode;
  billingPeriod: Extract<BillingPeriod, "MONTHLY" | "YEARLY">;
  idempotencyKey: string;
  correlationId?: string;
  context: DraftContext;
}) {
  const eligibility = await getSubscriptionCheckoutEligibility({
    companyId: input.context.company.id,
    userId: input.context.user.id,
    correlationId: input.correlationId,
  });
  throwCheckoutEligibilityError(eligibility);
  if (!eligibility.customer) {
    throw new ManualSubscriptionRequestError("USER_NOT_FOUND", 404);
  }
  const access = eligibility.membershipAccess;
  const isIndependentConversion = access.capabilities["personal.subscription.request"];
  const canonical = CANONICAL_SUBSCRIPTION_PLANS[input.planSlug];
  if (!canonical.billingIntervals.includes(input.billingPeriod)) {
    throw new ManualSubscriptionRequestError("BILLING_PERIOD_NOT_AVAILABLE");
  }
  const [persistedPlan, profile, sellerConfiguration] = await Promise.all([
    prisma.plan.findUnique({ where: { slug: input.planSlug } }),
    prisma.companyBillingProfile.findUnique({ where: { companyId: input.context.company.id } }),
    prisma.billingSellerConfiguration.findUnique({ where: { id: "logivya" } }),
  ]);
  if (!persistedPlan?.isActive) throw new ManualSubscriptionRequestError("PLAN_NOT_FOUND", 404);

  const sellerState = billingSellerConfigurationState(sellerConfiguration);
  if (!sellerConfiguration || !sellerState.checkoutAvailable) {
    throw new ManualSubscriptionRequestError("LEGAL_SELLER_CONFIGURATION_INCOMPLETE", 503, {
      missingFields: sellerState.missingFields,
    });
  }
  const seller = publicSellerIdentity(sellerConfiguration);

  const amountMinor = input.billingPeriod === "YEARLY"
    ? canonical.yearlyPriceMinor
    : canonical.monthlyPriceMinor;
  const immutableInput = {
    companyId: input.context.company.id,
    userId: input.context.user.id,
    planSlug: input.planSlug,
    billingPeriod: input.billingPeriod,
    amountMinor,
    currency: canonical.currency,
    pricingConfigVersion: SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
    bankConfigVersion: LOGIVYA_BANK_CONFIGURATION_VERSION,
    transferDescriptionEmail: eligibility.customer.email,
    purpose: isIndependentConversion ? "SHARED_MEMBER_CONVERSION" : "TENANT_PLAN",
    sourceMembershipId: isIndependentConversion ? access.membershipId : null,
  };
  const idempotencyKeyHash = hashIdempotencyValue(input.idempotencyKey);
  const requestHash = requestFingerprint(immutableInput);
  const requestScope = isIndependentConversion
    ? `membership:${access.membershipId}`
    : input.context.company.id;
  const deduplicationKey = activeRequestKey(requestScope);
  const existing = await prisma.subscriptionRequest.findUnique({
    where: {
      companyId_idempotencyKeyHash: {
        companyId: input.context.company.id,
        idempotencyKeyHash,
      },
    },
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ManualSubscriptionRequestError("IDEMPOTENCY_CONFLICT", 409);
    }
    logger.info("billing.checkout.duplicate_request_returned", {
      correlationId: input.correlationId,
      userId: input.context.user.id,
      companyId: input.context.company.id,
      requestId: existing.publicId,
      plan: existing.planCode,
      period: existing.billingPeriod,
      status: existing.status,
    });
    return serializeManualSubscriptionRequest(
      existing,
      legalDocumentsForRequest(existing, seller),
      true,
    );
  }

  const equivalent = await prisma.subscriptionRequest.findFirst({
    where: {
      companyId: input.context.company.id,
      purpose: isIndependentConversion
        ? "SHARED_MEMBER_CONVERSION"
        : "TENANT_PLAN",
      sourceMembershipId: isIndependentConversion ? access.membershipId : null,
      planCode: canonical.code,
      billingPeriod: input.billingPeriod,
      status: { in: ACTIVE_REQUEST_STATUSES },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (equivalent) {
    if (
      equivalent.status === "DRAFT"
      && equivalent.expiresAt
      && equivalent.expiresAt <= new Date()
    ) {
      await prisma.subscriptionRequest.update({
        where: { id: equivalent.id },
        data: { status: "EXPIRED", activeRequestKey: null },
      });
    } else {
      logger.info("billing.checkout.duplicate_request_returned", {
        correlationId: input.correlationId,
        userId: input.context.user.id,
        companyId: input.context.company.id,
        requestId: equivalent.publicId,
        plan: equivalent.planCode,
        period: equivalent.billingPeriod,
        status: equivalent.status,
      });
      return serializeManualSubscriptionRequest(
        equivalent,
        legalDocumentsForRequest(equivalent, seller),
        true,
      );
    }
  }

  const conflicting = await prisma.subscriptionRequest.findFirst({
    where: {
      companyId: input.context.company.id,
      requestedByUserId: input.context.user.id,
      purpose: isIndependentConversion
        ? "SHARED_MEMBER_CONVERSION"
        : "TENANT_PLAN",
      sourceMembershipId: isIndependentConversion ? access.membershipId : null,
      status: { in: ACTIVE_REQUEST_STATUSES },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (conflicting) {
    if (conflicting.status !== "DRAFT") {
      throw new ManualSubscriptionRequestError(
        "ACTIVE_SUBSCRIPTION_REQUEST_EXISTS",
        409,
        {
          requestId: conflicting.publicId,
          planCode: conflicting.planCode,
          billingPeriod: conflicting.billingPeriod,
        },
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionRequest.update({
        where: { id: conflicting.id },
        data: {
          status: "CANCELLED",
          activeRequestKey: null,
          cancelledAt: new Date(),
        },
      });
      await tx.subscriptionRequestTransition.create({
        data: {
          requestId: conflicting.id,
          fromStatus: "DRAFT",
          toStatus: "CANCELLED",
          actorType: "USER",
          actorUserId: input.context.user.id,
          customerNote: "SUPERSEDED_BY_NEW_SELECTION",
          correlationId: input.correlationId,
        },
      });
    });
  }

  const paymentReference = compactId("LOG");
  const publicId = compactId("SUB");
  const buyer = isIndependentConversion
    ? independentBuyerSnapshot(input.context, eligibility.customer)
    : buyerSnapshot(input.context, eligibility.customer, profile);
  const snapshot = planSnapshot(input.planSlug);
  let request: Prisma.SubscriptionRequestGetPayload<Record<string, never>>;
  try {
    request = await prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionRequest.create({
        data: {
          publicId,
          activeRequestKey: deduplicationKey,
          companyId: input.context.company.id,
          purpose: isIndependentConversion
            ? "SHARED_MEMBER_CONVERSION"
            : "TENANT_PLAN",
          sourceCompanyId: isIndependentConversion
            ? input.context.company.id
            : null,
          sourceMembershipId: isIndependentConversion
            ? access.membershipId
            : null,
          requestedByUserId: input.context.user.id,
          planId: persistedPlan.id,
          status: "DRAFT",
          billingPeriod: input.billingPeriod,
          amount: money(amountMinor),
          currency: canonical.currency,
          planCode: canonical.code,
          planName: persistedPlan.name,
          planSnapshot: asJson(snapshot),
          buyerSnapshot: asJson(buyer),
          sellerSnapshot: asJson(seller),
          bankSnapshot: asJson(LOGIVYA_BANK_TRANSFER),
          paymentReference,
          transferDescriptionEmail: eligibility.customer.email,
          pricingConfigVersion:
            SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
          bankConfigVersion: LOGIVYA_BANK_CONFIGURATION_VERSION,
          correlationId: input.correlationId,
          requestHash,
          idempotencyKeyHash,
          expiresAt: new Date(Date.now() + REQUEST_EXPIRY_DAYS * 24 * 60 * 60_000),
        },
      });
      await tx.subscriptionRequestTransition.create({
        data: {
          requestId: created.id,
          toStatus: "DRAFT",
          actorType: "USER",
          actorUserId: input.context.user.id,
          correlationId: input.correlationId,
        },
      });
      return created;
    });
  } catch (error) {
    if (
      error instanceof PrismaRuntime.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      const concurrent = await prisma.subscriptionRequest.findUnique({
        where: { activeRequestKey: deduplicationKey },
      });
      if (concurrent) {
        if (
          concurrent.planCode !== canonical.code
          || concurrent.billingPeriod !== input.billingPeriod
        ) {
          throw new ManualSubscriptionRequestError(
            "ACTIVE_SUBSCRIPTION_REQUEST_EXISTS",
            409,
            {
              requestId: concurrent.publicId,
              planCode: concurrent.planCode,
              billingPeriod: concurrent.billingPeriod,
            },
          );
        }
        logger.info("billing.checkout.duplicate_request_returned", {
          correlationId: input.correlationId,
          userId: input.context.user.id,
          companyId: input.context.company.id,
          requestId: concurrent.publicId,
          plan: concurrent.planCode,
          period: concurrent.billingPeriod,
          status: concurrent.status,
        });
        return serializeManualSubscriptionRequest(
          concurrent,
          legalDocumentsForRequest(concurrent, seller),
          true,
        );
      }
    }
    throw error;
  }

  logger.info("billing.checkout.plan_selected", {
    correlationId: input.correlationId,
    userId: input.context.user.id,
    companyId: input.context.company.id,
    requestId: request.publicId,
    plan: request.planCode,
    period: request.billingPeriod,
    status: request.status,
  });
  return serializeManualSubscriptionRequest(
    request,
    legalDocumentsForRequest(request, seller),
    false,
  );
}

export async function submitManualSubscriptionRequest(input: {
  requestId: string;
  companyId: string;
  userId: string;
  acceptedDocuments: AcceptedDocument[];
  immediatePerformanceConsent: boolean;
  paymentProvider?: "MANUAL" | "IYZICO";
  customerNote?: string;
  correlationId?: string;
  request: Request;
}) {
  const paymentProvider = input.paymentProvider ?? "MANUAL";
  const eligibility = await getSubscriptionCheckoutEligibility({
    companyId: input.companyId,
    userId: input.userId,
    correlationId: input.correlationId,
  });
  throwCheckoutEligibilityError(eligibility);
  if (!input.immediatePerformanceConsent) {
    throw new ManualSubscriptionRequestError(
      "IMMEDIATE_PERFORMANCE_CONSENT_REQUIRED",
    );
  }
  const network = requestNetworkSummary(input.request);
  const now = new Date();
  const sellerConfiguration =
    await prisma.billingSellerConfiguration.findUnique({
      where: { id: "logivya" },
    });
  const sellerState = billingSellerConfigurationState(sellerConfiguration);
  if (!sellerConfiguration || !sellerState.checkoutAvailable) {
    throw new ManualSubscriptionRequestError(
      "LEGAL_SELLER_CONFIGURATION_INCOMPLETE",
      503,
      { missingFields: sellerState.missingFields },
    );
  }
  const seller = publicSellerIdentity(sellerConfiguration);
  const submission = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SubscriptionRequest"
      WHERE "id" = ${input.requestId} AND "companyId" = ${input.companyId}
      FOR UPDATE
    `;
    if (!rows.length) throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
    const request = await tx.subscriptionRequest.findUnique({ where: { id: input.requestId } });
    if (
      !request
      || request.companyId !== input.companyId
      || request.requestedByUserId !== input.userId
    ) {
      throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
    }
    const legalDocuments = legalDocumentsForRequest(request, seller);
    verifyAcceptedDocuments(legalDocuments, input.acceptedDocuments);
    const consentLocale = input.request.headers.get("x-logivya-locale")?.slice(0, 16)
      || input.request.headers.get("accept-language")?.split(",")[0]?.slice(0, 16)
      || "tr";
    const persistCurrentConsents = () => Promise.all(
      legalDocuments.map((document) => tx.subscriptionRequestConsent.upsert({
        where: {
          requestId_documentType: {
            requestId: request.id,
            documentType: document.type,
          },
        },
        create: {
          requestId: request.id,
          userId: input.userId,
          documentType: document.type,
          documentVersion: document.version,
          documentHash: document.hash,
          locale: consentLocale,
          acceptedAt: now,
          userAgentSummary: network.userAgentSummary,
          ipAddressMasked: network.ipAddressMasked,
          documentSnapshot: asJson(document),
        },
        update: {
          userId: input.userId,
          documentVersion: document.version,
          documentHash: document.hash,
          locale: consentLocale,
          acceptedAt: now,
          userAgentSummary: network.userAgentSummary,
          ipAddressMasked: network.ipAddressMasked,
          documentSnapshot: asJson(document),
        },
      })),
    );
    if (request.status === "AWAITING_PAYMENT") {
      await persistCurrentConsents();
      const current = request.paymentProvider === paymentProvider
        ? request
        : await tx.subscriptionRequest.update({
            where: { id: request.id },
            data: { paymentProvider },
          });
      return { request: current, duplicate: true };
    }
    if (request.status !== "DRAFT") {
      throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_STATE_CONFLICT", 409);
    }
    if (request.expiresAt && request.expiresAt <= now) {
      await tx.subscriptionRequest.update({
        where: { id: request.id },
        data: { status: "EXPIRED", activeRequestKey: null },
      });
      await tx.subscriptionRequestTransition.create({
        data: {
          requestId: request.id,
          fromStatus: "DRAFT",
          toStatus: "EXPIRED",
          actorType: "SYSTEM",
        },
      });
      throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_EXPIRED", 409);
    }

    await persistCurrentConsents();
    const updated = await tx.subscriptionRequest.update({
      where: { id: request.id },
      data: {
        status: "AWAITING_PAYMENT",
        paymentProvider,
        immediatePerformanceConsentAt: now,
        correlationId: request.correlationId || input.correlationId,
        customerNote: input.customerNote?.trim() || null,
      },
    });
    await tx.subscriptionRequestTransition.create({
      data: {
        requestId: request.id,
        fromStatus: "DRAFT",
        toStatus: "AWAITING_PAYMENT",
        actorType: "USER",
        actorUserId: input.userId,
        customerNote: input.customerNote?.trim() || null,
        correlationId: input.correlationId,
      },
    });
    await tx.notification.create({
      data: {
        companyId: request.companyId,
        userId: input.userId,
        type: "subscription.request_created",
        category: "BILLING",
        title: "Abonelik talebiniz oluşturuldu",
        message: paymentProvider === "IYZICO"
          ? "Abonelik talebiniz oluşturuldu. Güvenli kart ödeme sayfasına yönlendiriliyorsunuz."
          : "Abonelik talebiniz oluşturuldu. Ödeme bilgileriniz hazır.",
        deepLink: "/settings/subscriptions",
        payload: asJson({
          requestId: request.publicId,
          planName: request.planName,
          amount: Number(request.amount),
          currency: request.currency,
          status: "AWAITING_PAYMENT",
        }),
      },
    });
    if (paymentProvider === "MANUAL") {
      await createPlatformAdminRequestNotification(tx, updated);
    }
    return { request: updated, duplicate: false };
  }, { isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable });

  logger.info(
    submission.duplicate
      ? "billing.checkout.duplicate_request_returned"
      : "billing.checkout.payment_request_created",
    {
      correlationId: input.correlationId,
      userId: input.userId,
      companyId: input.companyId,
      requestId: submission.request.publicId,
      plan: submission.request.planCode,
      period: submission.request.billingPeriod,
      paymentProvider: submission.request.paymentProvider,
      status: submission.request.status,
    },
  );
  const result = await getManualSubscriptionRequestForCompany(
    submission.request.id,
    input.companyId,
  );
  return { ...result, duplicate: submission.duplicate };
}

async function createPlatformAdminRequestNotification(
  database: Pick<Prisma.TransactionClient, "notification" | "user">,
  request: {
  id: string;
  publicId: string;
  companyId: string;
  requestedByUserId: string | null;
  planName: string;
  billingPeriod: BillingPeriod;
  amount: Prisma.Decimal;
  currency: string;
  paymentReference: string;
  transferDescriptionEmail: string | null;
  correlationId: string | null;
  status: SubscriptionRequestStatus;
  createdAt: Date;
  },
) {
  const [admin, requester] = await Promise.all([
    database.user.findUnique({
      where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
      select: { id: true },
    }),
    request.requestedByUserId
      ? database.user.findUnique({
          where: { id: request.requestedByUserId },
          select: { name: true, email: true },
        })
      : null,
  ]);
  if (!admin) return;
  await database.notification.create({
    data: {
      companyId: request.companyId,
      userId: admin.id,
      type: "admin.subscription_request_created",
      category: "BILLING",
      priority: "HIGH",
      audience: "PLATFORM_ADMIN",
      title: "Yeni abonelik ödeme talebi",
      message: `${requester?.name || "Bir kullanıcı"} kullanıcısı ${request.planName} paketinin ${billingPeriodLabel(request.billingPeriod)} dönemi için ${amountLabel(request.amount, request.currency)} tutarında banka transferi talebi oluşturdu.`,
      deepLink: "/admin/subscriptions",
      payload: asJson({
        requestId: request.publicId,
        tenantId: request.companyId,
        userId: request.requestedByUserId,
        planName: request.planName,
        billingPeriod: request.billingPeriod,
        amount: Number(request.amount),
        currency: request.currency,
        createdAt: request.createdAt.toISOString(),
        paymentReference: request.paymentReference,
        transferDescription:
          request.transferDescriptionEmail || requester?.email || null,
        status: request.status,
      }),
    },
  });
  logger.info("billing.checkout.admin_notification_created", {
    correlationId: request.correlationId,
    userId: request.requestedByUserId,
    companyId: request.companyId,
    requestId: request.publicId,
    plan: request.planName,
    period: request.billingPeriod,
    status: request.status,
  });
}

export async function listManualSubscriptionRequestsForCompany(companyId: string) {
  const requests = await prisma.subscriptionRequest.findMany({
    where: {
      companyId,
      status: { not: "DRAFT" },
    },
    include: {
      requestedBy: { select: { id: true, name: true, email: true, phone: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      activationSubscription: { include: { plan: true } },
      consents: true,
      transitions: {
        include: { actorUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  });
  return requests.map(serializeDetailedManualSubscriptionRequest);
}

export async function listManualSubscriptionRequestsForUser(userId: string) {
  const requests = await prisma.subscriptionRequest.findMany({
    where: {
      requestedByUserId: userId,
      status: { not: "DRAFT" },
    },
    include: {
      requestedBy: { select: { id: true, name: true, email: true, phone: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      activationSubscription: { include: { plan: true } },
      consents: true,
      transitions: {
        include: { actorUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
  });
  return requests.map(serializeDetailedManualSubscriptionRequest);
}

export async function getManualSubscriptionRequestForCompany(id: string, companyId: string) {
  const request = await prisma.subscriptionRequest.findFirst({
    where: { id, companyId },
    include: {
      requestedBy: { select: { id: true, name: true, email: true, phone: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      activationSubscription: { include: { plan: true } },
      consents: true,
      transitions: {
        include: { actorUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!request) throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
  return serializeDetailedManualSubscriptionRequest(request);
}

export async function cancelManualSubscriptionRequest(input: {
  requestId: string;
  companyId: string;
  userId: string;
  reason?: string;
}) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SubscriptionRequest"
      WHERE "id" = ${input.requestId} AND "companyId" = ${input.companyId}
      FOR UPDATE
    `;
    if (!rows.length) throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
    const request = await tx.subscriptionRequest.findUnique({ where: { id: input.requestId } });
    if (
      !request
      || request.companyId !== input.companyId
      || request.requestedByUserId !== input.userId
    ) {
      throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
    }
    if (request.status === "CANCELLED") return request;
    if (!CANCELLABLE_STATUSES.includes(request.status)) {
      throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_CANCELLABLE", 409);
    }
    const updated = await tx.subscriptionRequest.update({
      where: { id: request.id },
      data: {
        status: "CANCELLED",
        activeRequestKey: null,
        cancelledAt: now,
        customerNote: input.reason?.trim() || request.customerNote,
      },
    });
    await tx.subscriptionRequestTransition.create({
      data: {
        requestId: request.id,
        fromStatus: request.status,
        toStatus: "CANCELLED",
        actorType: "USER",
        actorUserId: input.userId,
        customerNote: input.reason?.trim() || null,
      },
    });
    await tx.notification.create({
      data: {
        companyId: request.companyId,
        userId: input.userId,
        type: "subscription.request_cancelled",
        category: "BILLING",
        title: "Abonelik talebi iptal edildi",
        message: "Abonelik talebiniz iptal edildi.",
        deepLink: "/settings/subscriptions",
        payload: asJson({ requestId: request.publicId, status: "CANCELLED" }),
      },
    });
    return updated;
  }, { isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable });
}

export async function listManualSubscriptionRequestsForAdmin(input: {
  status?: SubscriptionRequestStatus;
  query?: string;
}) {
  const query = input.query?.trim() || "";
  const requests = await prisma.subscriptionRequest.findMany({
    where: {
      ...(input.status ? { status: input.status } : { status: { not: "DRAFT" } }),
      ...(query ? {
        OR: [
          { publicId: { contains: query, mode: "insensitive" } },
          { paymentReference: { contains: query, mode: "insensitive" } },
          { planName: { contains: query, mode: "insensitive" } },
          { company: { name: { contains: query, mode: "insensitive" } } },
          { requestedBy: { email: { contains: query, mode: "insensitive" } } },
        ],
      } : {}),
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          subscriptions: {
            where: { status: { in: ["ACTIVE", "TRIALING"] } },
            include: { plan: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
      requestedBy: { select: { id: true, name: true, email: true, phone: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      activationSubscription: { include: { plan: true } },
      consents: true,
      transitions: {
        include: { actorUser: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 300,
  });
  return requests.map((request) => ({
    ...serializeDetailedManualSubscriptionRequest(request),
    company: request.company,
    currentSubscription: request.company.subscriptions[0] ?? null,
  }));
}

export async function transitionManualSubscriptionRequest(input: {
  requestId: string;
  adminUserId: string;
  action: "UNDER_REVIEW" | "CLARIFICATION_REQUIRED" | "REJECTED" | "CANCELLED";
  customerNote?: string;
  internalNote?: string;
  correlationId?: string;
}) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SubscriptionRequest" WHERE "id" = ${input.requestId} FOR UPDATE
    `;
    if (!rows.length) throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
    const request = await tx.subscriptionRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);

    const allowed = input.action === "UNDER_REVIEW"
      ? REVIEWABLE_STATUSES
      : input.action === "CLARIFICATION_REQUIRED" || input.action === "REJECTED" || input.action === "CANCELLED"
        ? REJECTABLE_STATUSES
        : [];
    if (!allowed.includes(request.status)) {
      if (request.status === input.action) return request;
      throw new ManualSubscriptionRequestError("SUBSCRIPTION_REQUEST_STATE_CONFLICT", 409);
    }
    if (input.action === "CLARIFICATION_REQUIRED" && !input.customerNote?.trim()) {
      throw new ManualSubscriptionRequestError("CUSTOMER_NOTE_REQUIRED");
    }
    if (input.action === "REJECTED" && !input.customerNote?.trim()) {
      throw new ManualSubscriptionRequestError("REJECTION_REASON_REQUIRED");
    }

    const updated = await tx.subscriptionRequest.update({
      where: { id: request.id },
      data: {
        status: input.action,
        activeRequestKey: ["REJECTED", "CANCELLED"].includes(input.action)
          ? null
          : request.activeRequestKey,
        reviewedByUserId: input.adminUserId,
        reviewedAt: now,
        adminCustomerNote: input.customerNote?.trim() || request.adminCustomerNote,
        adminInternalNote: input.internalNote?.trim() || request.adminInternalNote,
        rejectedAt: input.action === "REJECTED" ? now : request.rejectedAt,
        cancelledAt: input.action === "CANCELLED" ? now : request.cancelledAt,
      },
    });
    await tx.subscriptionRequestTransition.create({
      data: {
        requestId: request.id,
        fromStatus: request.status,
        toStatus: input.action,
        actorType: "ADMIN",
        actorUserId: input.adminUserId,
        customerNote: input.customerNote?.trim() || null,
        internalNote: input.internalNote?.trim() || null,
        correlationId: input.correlationId,
      },
    });
    if (request.requestedByUserId) {
      const notification = requestStatusNotification(input.action, request.planName);
      await tx.notification.create({
        data: {
          companyId: request.companyId,
          userId: request.requestedByUserId,
          type: notification.type,
          category: "BILLING",
          title: notification.title,
          message: notification.message,
          deepLink: "/settings/subscriptions",
          payload: asJson({
            requestId: request.publicId,
            status: input.action,
            note: input.customerNote?.trim() || null,
          }),
        },
      });
    }
    return updated;
  }, { isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable });
  return result;
}

function requestStatusNotification(status: SubscriptionRequestStatus, planName: string) {
  if (status === "UNDER_REVIEW") {
    return { type: "subscription.request_under_review", title: "Ödemeniz kontrol ediliyor", message: "Ödemeniz kontrol ediliyor." };
  }
  if (status === "CLARIFICATION_REQUIRED") {
    return { type: "subscription.request_clarification", title: "Ek bilgi gerekiyor", message: "Ödemenizin eşleştirilmesi için ek bilgi gerekiyor." };
  }
  if (status === "REJECTED") {
    return { type: "subscription.request_rejected", title: "Abonelik talebi onaylanamadı", message: "Abonelik talebiniz onaylanamadı. Ayrıntıları abonelik sayfasından inceleyebilirsiniz." };
  }
  if (status === "CANCELLED") {
    return { type: "subscription.request_cancelled", title: "Abonelik talebi iptal edildi", message: "Abonelik talebiniz iptal edildi." };
  }
  return { type: "subscription.request_activated", title: "Aboneliğiniz etkinleştirildi", message: `Ödemeniz onaylandı. ${planName} paketiniz etkinleştirildi.` };
}

export function serializeManualSubscriptionRequest(
  request: {
    id: string;
    publicId: string;
    companyId: string;
    activationSubscriptionId: string | null;
    purpose?: SubscriptionRequestPurpose;
    sourceCompanyId?: string | null;
    conversionCompanyId?: string | null;
    status: SubscriptionRequestStatus;
    paymentProvider?: BillingProvider;
    billingPeriod: BillingPeriod;
    amount: Prisma.Decimal;
    currency: string;
    planCode: string;
    planName: string;
    planSnapshot: Prisma.JsonValue;
    buyerSnapshot: Prisma.JsonValue;
    sellerSnapshot: Prisma.JsonValue;
    bankSnapshot: Prisma.JsonValue;
    paymentReference: string;
    transferDescriptionEmail?: string | null;
    pricingConfigVersion?: string | null;
    bankConfigVersion?: string | null;
    correlationId?: string | null;
    immediatePerformanceConsentAt?: Date | null;
    customerNote: string | null;
    adminCustomerNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date | null;
  },
  legalDocuments: BillingLegalDocument[] = [],
  duplicate = false,
) {
  const buyer = storedObject(
    request.buyerSnapshot,
    "INVALID_BUYER_SNAPSHOT",
  );
  const transferDescription = String(
    request.transferDescriptionEmail || buyer.email || request.paymentReference,
  );
  return {
    id: request.id,
    publicId: request.publicId,
    tenantId: request.companyId,
    purpose: request.purpose ?? "TENANT_PLAN",
    sourceTenantId: request.sourceCompanyId ?? null,
    conversionTenantId: request.conversionCompanyId ?? null,
    status: publicSubscriptionRequestStatus(request.status),
    workflowStatus: request.status,
    paymentMethod: request.paymentProvider === "IYZICO"
      ? ("IYZICO_CHECKOUT" as const)
      : ("BANK_TRANSFER" as const),
    paymentProvider: request.paymentProvider ?? "MANUAL",
    billingPeriod: request.billingPeriod,
    amount: request.amount.toString(),
    currency: request.currency,
    planCode: request.planCode,
    planName: request.planName,
    planSnapshot: request.planSnapshot,
    buyerSnapshot: request.buyerSnapshot,
    seller: storedSeller(request.sellerSnapshot),
    bank: request.bankSnapshot,
    paymentReference: request.paymentReference,
    transferDescription,
    pricingConfigVersion: request.pricingConfigVersion || null,
    bankConfigVersion: request.bankConfigVersion || null,
    correlationId: request.correlationId || null,
    immediatePerformanceConsentAt:
      request.immediatePerformanceConsentAt?.toISOString() || null,
    customerNote: request.customerNote,
    adminCustomerNote: request.adminCustomerNote,
    legalDocuments,
    legalConsentSnapshot: legalDocuments.map((document) => ({
      documentType: document.type,
      version: document.version,
      hash: document.hash,
      acceptedAt: "acceptedAt" in document
        && typeof document.acceptedAt === "string"
        ? document.acceptedAt
        : null,
    })),
    resultingSubscriptionId: request.activationSubscriptionId,
    rejectionReason: request.status === "REJECTED"
      ? request.adminCustomerNote
      : null,
    duplicate,
    canCancel: CANCELLABLE_STATUSES.includes(request.status),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    expiresAt: request.expiresAt?.toISOString() ?? null,
  };
}

function publicSubscriptionRequestStatus(status: SubscriptionRequestStatus) {
  if (status === "AWAITING_PAYMENT" || status === "DRAFT") {
    return "PENDING_PAYMENT";
  }
  if (status === "UNDER_REVIEW" || status === "CLARIFICATION_REQUIRED") {
    return "PAYMENT_REVIEW";
  }
  if (status === "ACTIVATED") {
    return "APPROVED";
  }
  return status;
}

function serializeDetailedManualSubscriptionRequest(request: RequestWithDetails | (RequestWithDetails & { company: unknown })) {
  const legalDocuments = request.consents.map((consent) => {
    const snapshot = storedObject(consent.documentSnapshot, "INVALID_LEGAL_DOCUMENT_SNAPSHOT");
    return {
      type: consent.documentType,
      title: String(snapshot.title || consent.documentType),
      version: consent.documentVersion,
      hash: consent.documentHash,
      content: String(snapshot.content || ""),
      acceptedAt: consent.acceptedAt.toISOString(),
      locale: consent.locale,
    };
  });
  return {
    ...serializeManualSubscriptionRequest(request, legalDocuments),
    requestedBy: request.requestedBy,
    reviewedBy: request.reviewedBy,
    activationSubscription: request.activationSubscription,
    transitions: request.transitions.map((transition) => ({
      id: transition.id,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      actorType: transition.actorType,
      actorUser: transition.actorUser,
      customerNote: transition.customerNote,
      internalNote: transition.internalNote,
      createdAt: transition.createdAt.toISOString(),
    })),
  };
}

export function manualSubscriptionRequestStatus(error: unknown) {
  if (error instanceof ManualSubscriptionRequestError) return error.status;
  if (!(error instanceof Error)) return 500;
  if (error.message === "UNAUTHORIZED") return 401;
  if (error.message === "FORBIDDEN" || error.message === "CSRF_REJECTED") return 403;
  if (error.message === "RATE_LIMITED") return 429;
  return 500;
}

export function manualSubscriptionRequestErrorBody(error: unknown) {
  if (error instanceof ManualSubscriptionRequestError) {
    return { error: error.message, details: error.details };
  }
  const code = error instanceof Error ? error.message : "SUBSCRIPTION_REQUEST_FAILED";
  return {
    error: ["UNAUTHORIZED", "FORBIDDEN", "CSRF_REJECTED", "RATE_LIMITED"].includes(code)
      ? code
      : "SUBSCRIPTION_REQUEST_FAILED",
  };
}
