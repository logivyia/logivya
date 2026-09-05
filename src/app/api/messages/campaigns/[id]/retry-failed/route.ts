import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { createMessageCorrelationId, readCampaignCorrelationId } from "@/server/messages/correlation";
import { messageQueue } from "@/server/queues/client";
import { writeAuditLog } from "@/server/security/audit";
import { hasUnconfirmedDelivery, UNKNOWN_DELIVERY_OUTCOME } from "@/server/messages/delivery-intent";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "retry_campaigns");
    const campaign = await prisma.messageCampaign.findFirst({ where: { id, companyId: company.id, createdById: user.id, deletedAt: null }, select: { id: true, contentJson: true } });
    if (!campaign) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const correlationId = readCampaignCorrelationId(campaign.contentJson) ?? createMessageCorrelationId();
    const failedRecipients = await prisma.messageRecipient.findMany({ where: { campaignId: id, campaign: { companyId: company.id, createdById: user.id }, status: "FAILED" }, select: { id: true, messageKeyJson: true } });
    const recipients = failedRecipients.filter(recipient => !hasUnconfirmedDelivery(recipient.messageKeyJson));
    const requiresReviewCount = failedRecipients.length - recipients.length;
    if (!recipients.length && requiresReviewCount) return NextResponse.json({ code: UNKNOWN_DELIVERY_OUTCOME, error: "Gönderimlerin sonucu doğrulanamadı. Tekrar göndermeden önce WhatsApp üzerinden teslim durumunu kontrol edin.", requiresReviewCount }, { status: 409 });
    const access = await subscriptionAccess.canSendMessage(company.id, recipients.length);
    if (!access.allowed) return NextResponse.json({ error: "Aboneliginiz aktif degil. Mesaj gondermek icin paketinizi yenileyin.", code: "SUBSCRIPTION_LOCKED", details: access, correlationId }, { status: 403 });
    await prisma.$transaction([
      prisma.messageRecipient.updateMany({ where: { campaignId: id, id: { in: recipients.map(recipient => recipient.id) }, campaign: { companyId: company.id, createdById: user.id }, status: "FAILED" }, data: { status: "PENDING", failedAt: null, errorMessage: null } }),
      prisma.messageCampaign.update({ where: { id }, data: { status: "QUEUED", failedCount: requiresReviewCount } }),
    ]);
    const queue = messageQueue();
    try {
      for (const recipient of recipients) {
        await queue.add("send-recipient", { companyId: company.id, campaignId: id, recipientId: recipient.id, correlationId, source: "retry" }, { jobId: `retry-${recipient.id}-${Date.now()}` });
      }
    } finally {
      await queue.close().catch(() => undefined);
    }
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "campaign.failed_retried", entityType: "MessageCampaign", entityId: id, after: { recipientCount: recipients.length, correlationId } });
    return NextResponse.json({ ok: true, count: recipients.length, requiresReviewCount, correlationId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
