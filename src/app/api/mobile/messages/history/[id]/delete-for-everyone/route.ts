import { requirePermission } from "@/server/auth/permissions";
import { requestCampaignDeleteForEveryone } from "@/server/messages/delete-for-everyone";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "delete_campaigns");
    await enforceOperationRateLimit({
      scope: "message.delete-everyone",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 60,
      windowMs: 10 * 60_000,
      request,
    });

    const result = await requestCampaignDeleteForEveryone({
      campaignId: id,
      companyId: company.id,
      userId: user.id,
    });

    if (!result.ok) {
      return mobileError(result.error ?? "DELETE_FOR_EVERYONE_UNAVAILABLE", "Mesaj herkesten silinemedi.", {
        status: result.status,
        details: { correlationId: result.correlationId, queued: result.queued ?? 0, expired: result.expired ?? 0, failed: result.failed ?? 0 },
      });
    }

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "campaign.delete_for_everyone_requested",
      entityType: "MessageCampaign",
      entityId: id,
      after: { queued: result.queued, expired: result.expired, failed: result.failed, correlationId: result.correlationId },
    });

    return mobileSuccess(
      {
        message: "Silme islemi baslatildi.",
        queued: result.queued,
        expired: result.expired,
        failed: result.failed,
        correlationId: result.correlationId,
        aggregate: result.aggregate,
      },
      { status: 202 },
    );
  } catch (error) {
    return mobileSafeError(error);
  }
}
