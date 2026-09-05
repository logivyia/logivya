import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { activateSubscriptionManually } from "@/server/billing/manual-activation";
import {
  ManualSubscriptionRequestError,
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
} from "@/server/billing/manual-subscription-requests";
import { SubscriptionActivationError } from "@/server/billing/subscription-activation";
import {
  approveSharedMemberConversion,
  SharedMemberConversionError,
} from "@/server/billing/shared-member-conversion";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  bankChecked: z.literal(true),
  internalNote: z.string().trim().min(5).max(1000),
});

function addBillingPeriod(date: Date, billingPeriod: "MONTHLY" | "YEARLY") {
  const result = new Date(date);
  if (billingPeriod === "YEARLY") {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  } else {
    result.setUTCMonth(result.getUTCMonth() + 1);
  }
  return result;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const correlationId = requestId(request);
  try {
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "BANK_CONFIRMATION_REQUIRED", requestId: correlationId },
        { status: 400 },
      );
    }
    const { user } = await requireCriticalAdminAction(
      request,
      "admin.subscriptions.approve",
      parsed.data.internalNote,
    );
    const subscriptionRequest = await prisma.subscriptionRequest.findUnique({
      where: { id },
      include: {
        activationSubscription: true,
        company: {
          include: {
            subscriptions: {
              where: { status: "ACTIVE" },
              include: { plan: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!subscriptionRequest) {
      throw new ManualSubscriptionRequestError(
        "SUBSCRIPTION_REQUEST_NOT_FOUND",
        404,
      );
    }
    if (subscriptionRequest.activationSubscription) {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        subscriptionId: subscriptionRequest.activationSubscription.id,
        requestId: correlationId,
      });
    }
    if (
      !["AWAITING_PAYMENT", "UNDER_REVIEW", "CLARIFICATION_REQUIRED"].includes(
        subscriptionRequest.status,
      )
    ) {
      throw new ManualSubscriptionRequestError(
        "SUBSCRIPTION_REQUEST_STATE_CONFLICT",
        409,
        {
          status: subscriptionRequest.status,
        },
      );
    }
    logger.info("billing.checkout.approval_started", {
      correlationId,
      userId: subscriptionRequest.requestedByUserId,
      companyId: subscriptionRequest.companyId,
      requestId: subscriptionRequest.publicId,
      plan: subscriptionRequest.planCode,
      period: subscriptionRequest.billingPeriod,
      status: subscriptionRequest.status,
      adminUserId: user.id,
    });

    if (subscriptionRequest.purpose === "SHARED_MEMBER_CONVERSION") {
      const approvalTime = new Date();
      const result = await approveSharedMemberConversion({
        requestId: subscriptionRequest.id,
        adminUserId: user.id,
        internalNote: parsed.data.internalNote,
        correlationId,
        startsAt: approvalTime,
        endsAt: addBillingPeriod(
          approvalTime,
          subscriptionRequest.billingPeriod as "MONTHLY" | "YEARLY",
        ),
      });
      await writeAuditLog(request, {
        companyId: result.companyId,
        userId: user.id,
        actorType: "PLATFORM_ADMIN",
        action: "SHARED_MEMBER_CONVERTED_TO_INDEPENDENT_OWNER",
        reason: parsed.data.internalNote,
        entityType: "SubscriptionRequest",
        entityId: subscriptionRequest.id,
        correlationId,
        before: {
          status: subscriptionRequest.status,
          sourceCompanyId: result.sourceCompanyId,
        },
        after: {
          status: "ACTIVATED",
          destinationCompanyId: result.companyId,
          subscriptionId: result.subscription.id,
        },
      });
      logger.info("billing.checkout.approval_completed", {
        correlationId,
        userId: subscriptionRequest.requestedByUserId,
        companyId: result.companyId,
        requestId: subscriptionRequest.publicId,
        plan: subscriptionRequest.planCode,
        period: subscriptionRequest.billingPeriod,
        status: "ACTIVATED",
        subscriptionId: result.subscription.id,
      });
      return NextResponse.json({
        ok: true,
        idempotent: result.idempotent,
        subscriptionId: result.subscription.id,
        companyId: result.companyId,
        requestId: correlationId,
      });
    }

    const current = subscriptionRequest.company.subscriptions[0];
    const currentEnd = current?.endsAt || current?.currentPeriodEndsAt;
    const samePlanRenewal =
      current?.plan.slug.toUpperCase() === subscriptionRequest.planCode &&
      currentEnd &&
      currentEnd > new Date();
    const approvalTime = new Date();
    const startsAt = samePlanRenewal
      ? current.startsAt || current.currentPeriodStartsAt || approvalTime
      : approvalTime;
    const endsAt = addBillingPeriod(
      samePlanRenewal ? currentEnd : approvalTime,
      subscriptionRequest.billingPeriod as "MONTHLY" | "YEARLY",
    );
    const result = await activateSubscriptionManually({
      companyId: subscriptionRequest.companyId,
      planSlug: subscriptionRequest.planCode.toLowerCase(),
      billingPeriod: subscriptionRequest.billingPeriod as "MONTHLY" | "YEARLY",
      startsAt,
      endsAt,
      currency: subscriptionRequest.currency,
      paymentMethod: "MANUAL_BANK_TRANSFER",
      adminUserId: user.id,
      note: parsed.data.internalNote,
      idempotencyKey: `subscription-request:${subscriptionRequest.id}`,
      requestId: subscriptionRequest.id,
    });
    await writeAuditLog(request, {
      companyId: subscriptionRequest.companyId,
      userId: user.id,
      actorType: "PLATFORM_ADMIN",
      action: "subscription.request_approved_and_activated",
      reason: parsed.data.internalNote,
      entityType: "SubscriptionRequest",
      entityId: subscriptionRequest.id,
      correlationId,
      before: { status: subscriptionRequest.status },
      after: {
        status: "ACTIVATED",
        subscriptionId: result.subscription.id,
        startsAt: result.subscription.startsAt?.toISOString() ?? null,
        endsAt: result.subscription.endsAt?.toISOString() ?? null,
      },
    });
    logger.info("billing.checkout.approval_completed", {
      correlationId,
      userId: subscriptionRequest.requestedByUserId,
      companyId: subscriptionRequest.companyId,
      requestId: subscriptionRequest.publicId,
      plan: subscriptionRequest.planCode,
      period: subscriptionRequest.billingPeriod,
      status: "ACTIVATED",
      subscriptionId: result.subscription.id,
    });
    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      subscriptionId: result.subscription.id,
      requestId: correlationId,
    });
  } catch (error) {
    logger.warn("billing.checkout.approval_rejected", {
      correlationId,
      failedStage: "manual_subscription_approval",
      errorCode:
        error instanceof Error ? error.message : "ADMIN_REQUEST_FAILED",
    });
    if (error instanceof SharedMemberConversionError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          requestId: correlationId,
        },
        { status: error.status },
      );
    }
    if (error instanceof SubscriptionActivationError) {
      const status =
        error.message === "SUBSCRIPTION_REQUEST_STATE_CONFLICT" ? 409 : 400;
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
          requestId: correlationId,
        },
        { status },
      );
    }
    const domainStatus = manualSubscriptionRequestStatus(error);
    if (domainStatus !== 500) {
      return NextResponse.json(
        {
          ...manualSubscriptionRequestErrorBody(error),
          requestId: correlationId,
        },
        { status: domainStatus },
      );
    }
    const safe = safeAdminError(error, correlationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
