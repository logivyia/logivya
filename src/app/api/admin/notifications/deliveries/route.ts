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
    const status = url.searchParams.get("status") || undefined;
    const channel = url.searchParams.get("channel") || undefined;
    const rows = await prisma.notificationDelivery.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(channel ? { channel: channel as never } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        event: { select: { type: true, category: true, correlationId: true } },
        company: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });
    const hasMore = rows.length > limit;
    const deliveries = rows.slice(0, limit);
    return NextResponse.json({
      deliveries,
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? (deliveries.at(-1)?.id ?? null) : null,
      },
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
