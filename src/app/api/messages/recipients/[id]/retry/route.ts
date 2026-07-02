import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { createMessageCorrelationId, readCampaignCorrelationId } from "@/server/messages/correlation";
import { messageQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "retry_campaigns");
    const recipient = await prisma.messageRecipient.findFirst({
      where: { id, status: "FAILED", campaign: { companyId: company.id, createdById: user.id, deletedAt: null } },
      select: { id: true, campaignId: true, campaign: { select: { contentJson: true } } },
    });
    if (!recipient) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const correlationId = readCampaignCorrelationId(recipient.campaign.contentJson) ?? createMessageCorrelationId();
    const access = await subscriptionAccess.canSendMessage(company.id, 1);
    if (!access.allowed) return NextResponse.json({ error: "Aboneliginiz aktif degil. Mesaj gondermek icin paketinizi yenileyin.", code: "SUBSCRIPTION_LOCKED", details: access, correlationId }, { status: 403 });
    await prisma.messageRecipient.update({ where: { id }, data: { status: "PENDING", failedAt: null, errorMessage: null } });
    const queue = messageQueue();
    try {
      await queue.add("send-recipient", { companyId: company.id, campaignId: recipient.campaignId, recipientId: id, correlationId, source: "retry" }, { jobId: `retry-${id}-${Date.now()}` });
    } finally {
      await queue.close().catch(() => undefined);
    }
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "recipient.retried", entityType: "MessageRecipient", entityId: id, after: { correlationId } });
    return NextResponse.json({ ok: true, correlationId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
