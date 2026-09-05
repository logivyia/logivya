import { after, NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { announcementPreviewHash } from "@/server/notifications/announcements";
import {
  drainNotificationOutbox,
  processNotificationAudienceExpansions,
  queueNotificationAudienceEvent,
} from "@/server/notifications/engine";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z.object({
  previewHash: z.string().length(64),
  confirmation: z.string().max(80),
  secondConfirmation: z.string().max(120).optional(),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_CONFIRMATION_REQUIRED" },
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
    if (announcement.status !== "DRAFT")
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_ALREADY_PUBLISHED" },
        { status: 409 },
      );
    const currentHash = announcementPreviewHash(announcement);
    if (
      currentHash !== announcement.previewHash ||
      parsed.data.previewHash !== currentHash
    )
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_PREVIEW_STALE" },
        { status: 409 },
      );
    const recipientCount = await prisma.companyUser.count({
      where: {
        status: "ACTIVE",
        ...(announcement.companyId
          ? { companyId: announcement.companyId }
          : {}),
      },
    });
    if (parsed.data.confirmation !== `PUBLISH ${recipientCount}`)
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_CONFIRMATION_INVALID" },
        { status: 400 },
      );
    if (
      recipientCount >= 1_000 &&
      parsed.data.secondConfirmation !== `CONFIRM ${announcement.id}`
    )
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_SECOND_CONFIRMATION_REQUIRED" },
        { status: 400 },
      );

    const result = await queueNotificationAudienceEvent({
      type: "administration.announcement",
      idempotencyKey: `announcement:${announcement.id}`,
      audience: announcement.audience as "COMPANY_USERS" | "PLATFORM_ALL_USERS",
      companyId: announcement.companyId || undefined,
      actorUserId: admin.user.id,
      content: { title: announcement.title, message: announcement.body },
      payload: { announcementId: announcement.id, locale: announcement.locale },
      channels: announcement.channels,
      priority: announcement.priority,
      deepLink: announcement.deepLink || undefined,
      scheduledAt: announcement.startsAt,
      expiresAt: announcement.endsAt || undefined,
    });
    const status =
      announcement.startsAt > new Date() ? "SCHEDULED" : "PUBLISHED";
    await prisma.notificationAnnouncement.update({
      where: { id },
      data: {
        status,
        approvalState: "APPROVED",
        approvedById: admin.user.id,
        approvedAt: new Date(),
        publishedEventId: result.event.id,
      },
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.announcement.published",
      reason: parsed.data.reason,
      entityType: "NotificationAnnouncement",
      entityId: id,
      metadata: {
        eventId: result.event.id,
        recipientCount,
        status,
        previewHash: currentHash,
      },
    });
    after(async () => {
      await processNotificationAudienceExpansions(20, 250);
      await drainNotificationOutbox(20, 100);
    });
    return NextResponse.json({
      ok: true,
      eventId: result.event.id,
      recipientCount,
      status,
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
