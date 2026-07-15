import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { safelyEvaluateTrialAfterConnection } from "@/server/billing/trial-service";
import { prisma } from "@/server/db";

const schema = z.object({ action: z.enum(["APPROVE_REVIEW", "BLOCK"]), reason: z.string().trim().min(8).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const { user } = await requireCriticalAdminAction(request, "admin.security.read", parsed.data.reason);
    const { id } = await params;
    const existing = await prisma.trialEntitlement.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const entitlement = await prisma.$transaction(async (tx) => {
      const updated = await tx.trialEntitlement.update({
        where: { id },
        data: parsed.data.action === "APPROVE_REVIEW"
          ? { status: "PENDING_IDENTITY", decisionCode: "MANUAL_REVIEW_APPROVED" }
          : { status: "BLOCKED", decisionCode: "MANUAL_REVIEW_BLOCKED" },
      });
      await tx.auditLog.create({
        data: {
          companyId: existing.companyId,
          userId: user.id,
          action: "trial.manual_review_decision",
          entityType: "TrialEntitlement",
          entityId: id,
          metadata: { action: parsed.data.action, reason: parsed.data.reason, previousStatus: existing.status, newStatus: updated.status },
        },
      });
      return updated;
    });
    if (parsed.data.action === "APPROVE_REVIEW" && entitlement.whatsappAccountId) {
      await safelyEvaluateTrialAfterConnection(entitlement.whatsappAccountId);
    }
    return NextResponse.json({ entitlement });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "FORBIDDEN" }, { status: 403 });
  }
}
