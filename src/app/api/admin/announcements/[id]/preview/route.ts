import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { announcementPreview, announcementPreviewHash } from "@/server/notifications/announcements";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin("platform:read", request);
    const { id } = await params;
    const announcement = await prisma.notificationAnnouncement.findUnique({ where: { id } });
    if (!announcement) return NextResponse.json({ error: "NOTIFICATION_NOT_FOUND" }, { status: 404 });
    const recipientCount = await prisma.companyUser.count({ where: { status: "ACTIVE", ...(announcement.companyId ? { companyId: announcement.companyId } : {}) } });
    const previewHash = announcementPreviewHash(announcement);
    return NextResponse.json({ preview: announcementPreview(announcement, recipientCount), previewHash, unchanged: previewHash === announcement.previewHash, requiresSecondConfirmation: recipientCount >= 1_000 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_ANNOUNCEMENT_PREVIEW_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}
