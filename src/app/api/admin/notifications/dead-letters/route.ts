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
    const resolved = url.searchParams.get("resolved");
    const rows = await prisma.notificationDeadLetter.findMany({
      where:
        resolved === "true"
          ? { resolvedAt: { not: null } }
          : resolved === "all"
            ? {}
            : { resolvedAt: null },
      orderBy: [{ deadLetteredAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
      include: {
        event: { select: { type: true, category: true, correlationId: true } },
        resolvedBy: { select: { id: true, email: true } },
      },
    });
    const hasMore = rows.length > limit;
    const deadLetters = rows.slice(0, limit);
    return NextResponse.json({
      deadLetters,
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? (deadLetters.at(-1)?.id ?? null) : null,
      },
    });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
