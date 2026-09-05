import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { safelyEvaluateTrialAfterConnection } from "@/server/billing/trial-service";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  action: z.enum(["APPROVE_REVIEW", "BLOCK"]),
  reason: z.string().trim().min(8).max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation.invalid", requestId: operationId },
        { status: 400 },
      );
    }
    const { user } = await requireCriticalAdminAction(
      request,
      "admin.security.update",
      parsed.data.reason,
    );
    const { id } = await params;
    const existing = await prisma.trialEntitlement.findUnique({
      where: { id },
    });
    if (!existing)
      return NextResponse.json(
        { error: "NOT_FOUND", requestId: operationId },
        { status: 404 },
      );
    if (
      !["PENDING_IDENTITY", "INELIGIBLE", "BLOCKED"].includes(existing.status)
    ) {
      return NextResponse.json(
        { error: "TRIAL_REVIEW_NOT_ACTIONABLE", requestId: operationId },
        { status: 409 },
      );
    }
    if (parsed.data.action === "BLOCK" && existing.status === "BLOCKED") {
      return NextResponse.json({
        entitlement: existing,
        idempotent: true,
        requestId: operationId,
      });
    }
    if (
      parsed.data.action === "APPROVE_REVIEW" &&
      existing.decisionCode === "MANUAL_REVIEW_APPROVED"
    ) {
      return NextResponse.json({
        entitlement: existing,
        idempotent: true,
        requestId: operationId,
      });
    }
    const entitlement = await prisma.$transaction(async (tx) => {
      const transition = await tx.trialEntitlement.updateMany({
        where: {
          id,
          status: existing.status,
          decisionCode: existing.decisionCode,
        },
        data:
          parsed.data.action === "APPROVE_REVIEW"
            ? {
                status: "PENDING_IDENTITY",
                decisionCode: "MANUAL_REVIEW_APPROVED",
              }
            : { status: "BLOCKED", decisionCode: "MANUAL_REVIEW_BLOCKED" },
      });
      if (transition.count !== 1) return null;
      const updated = await tx.trialEntitlement.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditLog.create({
        data: {
          companyId: existing.companyId,
          userId: user.id,
          action: "trial.manual_review_decision",
          entityType: "TrialEntitlement",
          entityId: id,
          metadata: {
            action: parsed.data.action,
            reason: parsed.data.reason,
            previousStatus: existing.status,
            newStatus: updated.status,
          },
        },
      });
      return updated;
    });
    if (!entitlement) {
      const current = await prisma.trialEntitlement.findUnique({
        where: { id },
      });
      const expectedDecision =
        parsed.data.action === "APPROVE_REVIEW"
          ? "MANUAL_REVIEW_APPROVED"
          : "MANUAL_REVIEW_BLOCKED";
      if (current?.decisionCode === expectedDecision) {
        return NextResponse.json({
          entitlement: current,
          idempotent: true,
          requestId: operationId,
        });
      }
      return NextResponse.json(
        { error: "TRIAL_STATE_CHANGED", requestId: operationId },
        { status: 409 },
      );
    }
    if (
      parsed.data.action === "APPROVE_REVIEW" &&
      entitlement.whatsappAccountId
    ) {
      await safelyEvaluateTrialAfterConnection(entitlement.whatsappAccountId);
    }
    return NextResponse.json({ entitlement, requestId: operationId });
  } catch (error) {
    const safe = safeAdminError(error, operationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
