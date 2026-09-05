import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import {
  announcementBaseSchema,
  announcementPreviewHash,
} from "@/server/notifications/announcements";
import { isSafeNotificationDeepLink } from "@/server/notifications/policy";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const patchSchema = announcementBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "NOTIFICATION_ANNOUNCEMENT_INVALID",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requirePlatformAdmin(
      "admin.notifications.update",
      request,
    );
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          error: "NOTIFICATION_ANNOUNCEMENT_INVALID",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    const { id } = await params;
    const current = await prisma.notificationAnnouncement.findUnique({
      where: { id },
    });
    if (!current)
      return NextResponse.json(
        { error: "NOTIFICATION_NOT_FOUND" },
        { status: 404 },
      );
    if (current.status !== "DRAFT")
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_NOT_EDITABLE" },
        { status: 409 },
      );
    const merged = {
      title: parsed.data.title ?? current.title,
      body: parsed.data.body ?? current.body,
      audience: parsed.data.audience ?? current.audience,
      companyId:
        parsed.data.companyId === undefined
          ? current.companyId
          : parsed.data.companyId,
      locale: parsed.data.locale ?? current.locale,
      channels: parsed.data.channels ?? current.channels,
      priority: parsed.data.priority ?? current.priority,
      deepLink:
        parsed.data.deepLink === undefined
          ? current.deepLink
          : parsed.data.deepLink,
      startsAt: parsed.data.startsAt
        ? new Date(parsed.data.startsAt)
        : current.startsAt,
      endsAt: parsed.data.endsAt
        ? new Date(parsed.data.endsAt)
        : current.endsAt,
    };
    if (merged.audience === "COMPANY_USERS" && !merged.companyId)
      return NextResponse.json(
        { error: "NOTIFICATION_COMPANY_REQUIRED" },
        { status: 400 },
      );
    if (merged.deepLink && !isSafeNotificationDeepLink(merged.deepLink))
      return NextResponse.json(
        { error: "NOTIFICATION_DEEP_LINK_INVALID" },
        { status: 400 },
      );
    if (merged.endsAt && merged.endsAt <= merged.startsAt)
      return NextResponse.json(
        { error: "NOTIFICATION_ANNOUNCEMENT_END_INVALID" },
        { status: 400 },
      );
    const previewHash = announcementPreviewHash(merged);
    const announcement = await prisma.notificationAnnouncement.update({
      where: { id },
      data: {
        ...merged,
        previewHash,
        approvalState: "PENDING",
        approvedAt: null,
        approvedById: null,
      },
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.announcement.draft_updated",
      entityType: "NotificationAnnouncement",
      entityId: id,
      before: { previewHash: current.previewHash },
      after: { previewHash },
    });
    return NextResponse.json({ announcement });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
