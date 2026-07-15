import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  reason: z.string().trim().min(8).max(500),
  durationHours: z.number().int().min(1).max(24 * 30).default(24),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const { id } = await params;
    const { user } = await requireCriticalAdminAction(request, "companies:manage", parsed.data.reason);
    const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!company) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const expiresAt = new Date(Date.now() + parsed.data.durationHours * 60 * 60_000);
    await writeAuditLog(request, {
      companyId: id,
      userId: user.id,
      action: "company.seat_rotation_override",
      entityType: "Company",
      entityId: id,
      after: { reason: parsed.data.reason, expiresAt: expiresAt.toISOString(), durationHours: parsed.data.durationHours },
    });
    return NextResponse.json({ ok: true, expiresAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "FORBIDDEN" }, { status: 403 });
  }
}
