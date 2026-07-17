import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("platform:read", request);
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const cursor = url.searchParams.get("cursor") || undefined;
    const resolved = url.searchParams.get("resolved");
    const rows = await prisma.notificationDeadLetter.findMany({
      where: resolved === "true" ? { resolvedAt: { not: null } } : resolved === "all" ? {} : { resolvedAt: null },
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
    return NextResponse.json({ deadLetters, pageInfo: { hasMore, nextCursor: hasMore ? deadLetters.at(-1)?.id ?? null : null } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_DEAD_LETTERS_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}
