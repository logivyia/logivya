import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import {
  processNotificationOutbox,
  retryNotificationDeadLetter,
} from "@/server/notifications/engine";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({ resolution: z.string().min(5).max(500) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "NOTIFICATION_RETRY_REASON_REQUIRED" },
        { status: 400 },
      );
    const admin = await requireCriticalAdminAction(
      request,
      "admin.notifications.update",
      parsed.data.resolution,
    );
    const { id } = await params;
    const result = await retryNotificationDeadLetter({
      deadLetterId: id,
      resolvedById: admin.user.id,
      resolution: parsed.data.resolution,
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.dead_letter.retried",
      entityType: "NotificationDeadLetter",
      entityId: id,
      reason: parsed.data.resolution,
      metadata: { outboxId: result.outboxId },
    });
    const processed = await processNotificationOutbox(25);
    return NextResponse.json({ ok: true, ...result, processed });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
