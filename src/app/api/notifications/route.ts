import { NextResponse } from "next/server";
import { getRequestLocale } from "@/i18n/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { localizeNotificationRecord } from "@/server/notifications/service";

export async function GET(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || undefined;
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 30)));
    const now = new Date();
    const rows = await prisma.notification.findMany({
      where: {
        companyId: company.id,
        userId: user.id,
        archivedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(category ? { category: category as never } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const locale = await getRequestLocale(request.headers.get("x-logivya-locale"));
    const notifications = await Promise.all(page.map((item) => localizeNotificationRecord(item, locale)));
    const unread = await prisma.notification.count({ where: { companyId: company.id, userId: user.id, isRead: false, archivedAt: null } });
    return NextResponse.json({ notifications, unread, pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)?.id ?? null : null } });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST() {
  try {
    const { company, user } = await requireApiSession();
    const now = new Date();
    await prisma.notification.updateMany({ where: { companyId: company.id, userId: user.id, isRead: false }, data: { isRead: true, readAt: now } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
