import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { isCategoryTargetError, updateCategoryWithTargets } from "@/server/categories/category-targets";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  groupIds: z.array(z.string()).max(5_000).optional(),
  contactIds: z.array(z.string()).max(50_000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_categories");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const category = await updateCategoryWithTargets({ companyId: company.id, userId: user.id }, id, parsed.data);
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "category.updated",
      entityType: "Category",
      entityId: id,
      after: {
        name: category.name,
        groupCount: category.assignedGroupCount,
        contactCount: category.assignedContactCount,
      },
    });
    return NextResponse.json({ ok: true, category });
  } catch (error) {
    if (isCategoryTargetError(error)) {
      return NextResponse.json({ error: error.code, message: error.userMessage }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_categories");
    const category = await prisma.category.findFirst({
      where: { id, companyId: company.id },
      include: { _count: { select: { groups: true, contacts: true } } },
    });
    if (!category) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await prisma.category.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "category.archived",
      entityType: "Category",
      entityId: id,
      before: { groupCount: category._count.groups, contactCount: category._count.contacts },
    });
    return NextResponse.json({ ok: true, removedRelationsOnly: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 403 });
  }
}
