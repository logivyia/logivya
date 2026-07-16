import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { requestCampaignDeleteForEveryone } from "@/server/messages/delete-for-everyone";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
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
      return NextResponse.json(
        {
          error: result.error ?? "DELETE_FOR_EVERYONE_UNAVAILABLE",
          correlationId: result.correlationId,
          queued: result.queued ?? 0,
          expired: result.expired ?? 0,
          failed: result.failed ?? 0,
        },
        { status: result.status },
      );
    }

    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "campaign.delete_for_everyone_requested",
      entityType: "MessageCampaign",
      entityId: id,
      after: {
        queued: result.queued,
        expired: result.expired,
        failed: result.failed,
        correlationId: result.correlationId,
      },
    });

    return NextResponse.json(
      {
        ok: true,
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
    const message = error instanceof Error ? error.message : "errors.generic";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "RATE_LIMITED" ? 429 : 403 });
  }
}
