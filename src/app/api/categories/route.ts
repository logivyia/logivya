import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/permissions";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ name: z.string().min(2).max(80), description: z.string().max(500).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#f97316"), groupIds: z.array(z.string()).default([]) });
export async function GET(request: Request) {
  try {
    const { company } = await requireApiSession();
    const showArchived = new URL(request.url).searchParams.get("showArchived") === "true";
    const categories = await prisma.category.findMany({ where: { companyId: company.id, ...(showArchived ? {} : { archivedAt: null }) }, include: { _count: { select: { groups: true } }, groups: { include: { group: { select: { id: true, name: true, canSend: true, isArchived: true } } } } }, orderBy: { name: "asc" }, take: 200 });
    return NextResponse.json({ categories });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_categories");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const validGroups = await prisma.whatsAppGroup.findMany({ where: { companyId: company.id, id: { in: parsed.data.groupIds } }, select: { id: true } });
    const category = await prisma.category.create({ data: { companyId: company.id, name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, groups: { create: validGroups.map((group) => ({ groupId: group.id })) } } });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "category.created", entityType: "Category", entityId: category.id, after: { name: category.name, groupCount: validGroups.length } });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 400 }); }
}
