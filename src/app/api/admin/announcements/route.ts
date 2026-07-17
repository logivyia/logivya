import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { announcementInputSchema, announcementPreviewHash } from "@/server/notifications/announcements";
import { writeAuditLog } from "@/server/security/audit";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("platform:read", request);
    const announcements = await prisma.notificationAnnouncement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { id: true, email: true } }, approvedBy: { select: { id: true, email: true } }, publishedEvent: { select: { id: true, _count: { select: { notifications: true, deliveries: true } } } } },
    });
    return NextResponse.json({ announcements });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ANNOUNCEMENTS_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin("operations:manage", request);
    const parsed = announcementInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_ANNOUNCEMENT_INVALID", issues: parsed.error.issues }, { status: 400 });
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    const previewHash = announcementPreviewHash({ ...parsed.data, startsAt, endsAt });
    const announcement = await prisma.notificationAnnouncement.create({
      data: { ...parsed.data, startsAt, endsAt, deepLink: parsed.data.deepLink || null, companyId: parsed.data.companyId || null, previewHash, createdById: admin.user.id },
    });
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorType: "PLATFORM_ADMIN", action: "notification.announcement.draft_created", entityType: "NotificationAnnouncement", entityId: announcement.id, metadata: { audience: announcement.audience, channels: announcement.channels, previewHash } });
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_ANNOUNCEMENT_INVALID";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}
