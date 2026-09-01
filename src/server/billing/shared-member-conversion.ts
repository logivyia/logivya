import "server-only";

import type { Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";

import { corePlanRule } from "@/server/billing/plan-matrix";
import { resolveCompanyEntitlements } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";

export class SharedMemberConversionError extends Error {
  constructor(
    code: string,
    public readonly status = 400,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "SharedMemberConversionError";
  }
}

function storedObject(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

export async function approveSharedMemberConversion(input: {
  requestId: string;
  adminUserId: string;
  internalNote: string;
  correlationId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  if (input.endsAt <= input.startsAt) {
    throw new SharedMemberConversionError("INVALID_SUBSCRIPTION_PERIOD");
  }

  return prisma.$transaction(async (tx) => {
    const transitionAt = new Date();
    const lockedRequest = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SubscriptionRequest"
      WHERE "id" = ${input.requestId}
      FOR UPDATE
    `;
    if (!lockedRequest.length) {
      throw new SharedMemberConversionError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
    }
    const request = await tx.subscriptionRequest.findUnique({
      where: { id: input.requestId },
      include: {
        activationSubscription: true,
        requestedBy: true,
      },
    });
    if (!request) {
      throw new SharedMemberConversionError("SUBSCRIPTION_REQUEST_NOT_FOUND", 404);
    }
    if (request.purpose !== "SHARED_MEMBER_CONVERSION") {
      throw new SharedMemberConversionError("INDEPENDENT_CONVERSION_NOT_ALLOWED", 409);
    }
    if (request.activationSubscription && request.conversionCompanyId) {
      return {
        subscription: request.activationSubscription,
        companyId: request.conversionCompanyId,
        sourceCompanyId: request.sourceCompanyId,
        idempotent: true,
      };
    }
    if (!["AWAITING_PAYMENT", "UNDER_REVIEW", "CLARIFICATION_REQUIRED"].includes(request.status)) {
      throw new SharedMemberConversionError(
        "SUBSCRIPTION_REQUEST_STATE_CONFLICT",
        409,
        { status: request.status },
      );
    }
    if (
      !request.sourceMembershipId
      || !request.sourceCompanyId
      || !request.requestedByUserId
      || !request.requestedBy
    ) {
      throw new SharedMemberConversionError("INDEPENDENT_CONVERSION_NOT_ALLOWED", 409);
    }

    const lockedMembership = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "CompanyUser"
      WHERE "id" = ${request.sourceMembershipId}
      FOR UPDATE
    `;
    if (!lockedMembership.length) {
      throw new SharedMemberConversionError("MEMBER_NOT_FOUND", 404);
    }
    const membership = await tx.companyUser.findFirst({
      where: {
        id: request.sourceMembershipId,
        companyId: request.sourceCompanyId,
        userId: request.requestedByUserId,
      },
    });
    if (!membership || membership.role === "OWNER" || membership.status !== "ACTIVE") {
      throw new SharedMemberConversionError("INDEPENDENT_CONVERSION_NOT_ALLOWED", 409);
    }
    if (membership.lifecycleState === "PENDING_ACTIVATION") {
      throw new SharedMemberConversionError("INDEPENDENT_CONVERSION_NOT_ALLOWED", 409);
    }

    const sourceEntitlement = await resolveCompanyEntitlements(
      request.sourceCompanyId,
      tx,
      transitionAt,
    );
    if (sourceEntitlement?.valid) {
      throw new SharedMemberConversionError("SHARED_SUBSCRIPTION_STILL_ACTIVE", 409);
    }

    const existingOwnership = await tx.company.findFirst({
      where: { ownerId: request.requestedByUserId },
      select: { id: true },
    });
    if (existingOwnership) {
      throw new SharedMemberConversionError("INDEPENDENT_CONVERSION_NOT_ALLOWED", 409, {
        reason: "ACTIVE_OWNER_TENANT_EXISTS",
      });
    }

    const plan = await tx.plan.findUnique({
      where: { slug: request.planCode.toLowerCase() },
    });
    const rule = corePlanRule(plan?.slug);
    if (!plan?.isActive || !rule || !["starter", "professional"].includes(plan.slug)) {
      throw new SharedMemberConversionError("PLAN_NOT_FOUND", 404);
    }
    const expectedAmount = request.billingPeriod === "YEARLY"
      ? rule.yearlyPriceTry
      : rule.monthlyPriceTry;
    if (
      !new PrismaRuntime.Decimal(request.amount).eq(expectedAmount)
      || request.currency !== plan.currency
    ) {
      throw new SharedMemberConversionError(
        "SUBSCRIPTION_REQUEST_SNAPSHOT_MISMATCH",
        409,
      );
    }

    const user = request.requestedBy;
    const buyer = storedObject(request.buyerSnapshot);
    const destination = await tx.company.create({
      data: {
        name: `${user.name} LOGIVYA`,
        email: user.email,
        phone: user.phone,
        ownerId: user.id,
        defaultLanguage: user.locale,
        defaultTimezone: user.timezone,
        defaultCountry: user.country,
        defaultCurrency: request.currency,
      },
    });
    await tx.companyUser.create({
      data: {
        companyId: destination.id,
        userId: user.id,
        createdByUserId: user.id,
        role: "OWNER",
        status: "ACTIVE",
        lifecycleState: "INDEPENDENT_OWNER",
        joinedAt: transitionAt,
        seatActivatedAt: transitionAt,
        activationCompletedAt: transitionAt,
      },
    });
    const billingName = text(buyer.name, user.name);
    const billingEmail = text(buyer.email, user.email);
    const billingAddress = text(buyer.address, "Address to be confirmed");
    const billingCountry = text(buyer.country, user.country || "TR");
    await tx.companyBillingProfile.create({
      data: {
        companyId: destination.id,
        billingType: "INDIVIDUAL",
        fullName: billingName,
        country: billingCountry,
        city: "Not provided",
        addressLine1: billingAddress,
        billingEmail,
        billingPhone: typeof buyer.phone === "string" ? buyer.phone : user.phone,
        invoiceType: "STANDARD_INVOICE",
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        companyId: destination.id,
        planId: plan.id,
        status: "ACTIVE",
        billingPeriod: request.billingPeriod,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        currentPeriodStartsAt: input.startsAt,
        currentPeriodEndsAt: input.endsAt,
        source: "MANUAL_ADMIN",
        provider: "MANUAL",
        manuallyActivatedByUserId: input.adminUserId,
      },
    });
    const payment = await tx.payment.create({
      data: {
        companyId: destination.id,
        subscriptionId: subscription.id,
        planId: plan.id,
        provider: "MANUAL",
        providerPaymentId: `manual:subscription-request:${request.id}`,
        status: "MANUALLY_CONFIRMED",
        paymentMethod: "MANUAL_BANK_TRANSFER",
        amount: request.amount,
        currency: request.currency,
        paidAt: input.startsAt,
        metadata: {
          requestId: request.publicId,
          purpose: request.purpose,
          correlationId: input.correlationId,
        },
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        companyId: destination.id,
        subscriptionId: subscription.id,
        invoiceType: "STANDARD_INVOICE",
        status: "DRAFT",
        currency: request.currency,
        subtotalAmount: request.amount,
        taxAmount: 0,
        totalAmount: request.amount,
        billingName,
        billingAddress,
        billingEmail,
        provider: "MANUAL",
        metadata: {
          requestId: request.publicId,
          sourceCompanyId: request.sourceCompanyId,
        },
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { invoiceId: invoice.id },
    });

    await tx.companyUser.update({
      where: { id: membership.id },
      data: {
        status: "REMOVED",
        lifecycleState: "DETACHED",
        removedAt: transitionAt,
        detachedAt: transitionAt,
        independentConvertedAt: transitionAt,
        suspendedAt: null,
      },
    });
    await Promise.all([
      tx.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: transitionAt },
      }),
      tx.mobileDeviceSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: transitionAt },
      }),
      tx.trustedDevice.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: transitionAt },
      }),
      tx.mobilePushToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: transitionAt },
      }),
      tx.forcedPasswordChangeChallenge.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: transitionAt },
      }),
      tx.mfaLoginChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: transitionAt },
      }),
    ]);

    await tx.subscriptionRequest.update({
      where: { id: request.id },
      data: {
        companyId: destination.id,
        conversionCompanyId: destination.id,
        activationSubscriptionId: subscription.id,
        status: "ACTIVATED",
        activeRequestKey: null,
        reviewedByUserId: input.adminUserId,
        reviewedAt: transitionAt,
        approvedAt: transitionAt,
        activatedAt: transitionAt,
        adminInternalNote: input.internalNote,
      },
    });
    await tx.subscriptionRequestTransition.create({
      data: {
        requestId: request.id,
        fromStatus: request.status,
        toStatus: "ACTIVATED",
        actorType: "ADMIN",
        actorUserId: input.adminUserId,
        internalNote: input.internalNote,
        correlationId: input.correlationId,
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        companyId: destination.id,
        subscriptionId: subscription.id,
        actorUserId: input.adminUserId,
        type: "SUBSCRIPTION_MANUALLY_ACTIVATED",
        message: "Independent subscription activated after shared access expiry.",
        metadata: {
          sourceCompanyId: request.sourceCompanyId,
          sourceMembershipId: membership.id,
          requestId: request.publicId,
        },
      },
    });
    await tx.subscriptionAuditLog.create({
      data: {
        companyId: destination.id,
        subscriptionId: subscription.id,
        actorUserId: input.adminUserId,
        eventType: "SHARED_MEMBER_CONVERTED_TO_INDEPENDENT_OWNER",
        previousState: {
          sourceCompanyId: request.sourceCompanyId,
          lifecycleState: membership.lifecycleState,
        },
        newState: {
          destinationCompanyId: destination.id,
          lifecycleState: "INDEPENDENT_OWNER",
          plan: plan.slug,
        },
        correlationId: input.correlationId,
      },
    });
    await tx.notification.create({
      data: {
        companyId: destination.id,
        userId: user.id,
        type: "subscription.independent_conversion_approved",
        category: "BILLING",
        title: "Personal subscription activated",
        message: "Your independent LOGIVYA workspace is ready.",
        deepLink: "/settings/subscriptions",
        payload: {
          destinationCompanyId: destination.id,
          plan: plan.slug,
          requestId: request.publicId,
        },
      },
    });

    return {
      subscription,
      companyId: destination.id,
      sourceCompanyId: request.sourceCompanyId,
      idempotent: false,
    };
  }, {
    isolationLevel: PrismaRuntime.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  });
}
