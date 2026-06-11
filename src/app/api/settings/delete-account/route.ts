import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ confirmation: z.literal("LOGIVYA HESABIMI KAPAT") });
export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    if (membership.role !== "OWNER") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    await prisma.$transaction([
      prisma.company.update({ where: { id: company.id }, data: { securityStatus: "DISABLED", campaignsPausedAt: new Date() } }),
      prisma.userSession.updateMany({ where: { companyId: company.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "company.deactivated", entityType: "Company", entityId: company.id });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 }); }
}
