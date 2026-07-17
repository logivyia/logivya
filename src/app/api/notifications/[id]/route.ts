import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

const schema = z.object({ action: z.enum(["read", "unread", "archive"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_ACTION_INVALID" }, { status: 400 });
    const { id } = await params;
    const { company, user } = await requireApiSession();
    const now = new Date();
    const data = parsed.data.action === "read"
      ? { isRead: true, readAt: now }
      : parsed.data.action === "unread"
        ? { isRead: false, readAt: null }
        : { archivedAt: now };
    const result = await prisma.notification.updateMany({ where: { id, companyId: company.id, userId: user.id }, data });
    if (!result.count) return NextResponse.json({ error: "NOTIFICATION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, action: parsed.data.action });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
