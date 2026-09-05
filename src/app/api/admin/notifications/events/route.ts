import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.notifications.read", request);
    const url = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") || 50)),
    );
    const cursor = url.searchParams.get("cursor") || undefined;
    const type = url.searchParams.get("type") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const rows = await prisma.notificationEvent.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(category ? { category: category as never } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        company: { select: { id: true, name: true } },
        actor: { select: { id: true, email: true } },
        _count: {
          select: {
            notifications: true,
            deliveries: true,
            outbox: true,
            deadLetters: true,
          },
        },
      },
    });
    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit);
    return NextResponse.json({
      events,
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? (events.at(-1)?.id ?? null) : null,
      },
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
