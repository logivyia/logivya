import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { processNotificationOutbox, retryNotificationDeadLetter } from "@/server/notifications/engine";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ resolution: z.string().min(5).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformAdmin("operations:manage", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_RETRY_REASON_REQUIRED" }, { status: 400 });
    const { id } = await params;
    const result = await retryNotificationDeadLetter({ deadLetterId: id, resolvedById: admin.user.id, resolution: parsed.data.resolution });
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
    const code = error instanceof Error ? error.message : "NOTIFICATION_RETRY_FAILED";
    return NextResponse.json({ error: code }, { status: code === "FORBIDDEN" ? 403 : code === "UNAUTHORIZED" ? 401 : 500 });
  }
}
