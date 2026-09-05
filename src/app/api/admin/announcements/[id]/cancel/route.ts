import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({ reason: z.string().trim().min(5).max(500) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "NOTIFICATION_CANCEL_REASON_REQUIRED" },
        { status: 400 },
      );
    const admin = await requireCriticalAdminAction(
      request,
      "admin.notifications.update",
      parsed.data.reason,
    );
    const { id } = await params;
    const announcement = await prisma.notificationAnnouncement.findUnique({
      where: { id },
    });
    if (!announcement)
      return NextResponse.json(
        { error: "NOTIFICATION_NOT_FOUND" },
        { status: 404 },
      );
    if (["COMPLETED", "CANCELED", "ARCHIVED"].includes(announcement.status))
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_NOT_CANCELABLE" },
        { status: 409 },
      );
    await prisma.$transaction(async (tx) => {
      await tx.notificationAnnouncement.update({
        where: { id },
        data: { status: "CANCELED" },
      });
      if (announcement.publishedEventId)
        await tx.notificationOutbox.updateMany({
          where: {
            eventId: announcement.publishedEventId,
            status: { in: ["PENDING", "QUEUED"] },
          },
          data: {
            status: "CANCELED",
            processedAt: new Date(),
            lastErrorCode: "ANNOUNCEMENT_CANCELED",
          },
        });
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.announcement.canceled",
      entityType: "NotificationAnnouncement",
      entityId: id,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
