import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { createCategoryWithTargets, isCategoryTargetError } from "@/server/categories/category-targets";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";

const schema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#f97316"),
  groupIds: z.array(z.string()).max(5_000).default([]),
  contactIds: z.array(z.string()).max(50_000).default([]),
});

export async function GET(request: Request) {
  try {
    const { company, user } = await requireApiSession();
    const showArchived = new URL(request.url).searchParams.get("showArchived") === "true";
    const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
    const categories = await prisma.category.findMany({
      where: { companyId: company.id, ...(showArchived ? {} : { archivedAt: null }) },
      include: {
        _count: {
          select: {
            groups: account
              ? { where: { group: { companyId: company.id, userId: user.id, accountId: account.id, isArchived: false } } }
              : { where: { groupId: "__NO_CURRENT_WHATSAPP_ACCOUNT__" } },
            contacts: account
              ? { where: { companyId: company.id, userId: user.id, accountId: account.id, contact: { isActive: true, isWhatsAppUser: true } } }
              : { where: { id: "__NO_CURRENT_WHATSAPP_ACCOUNT__" } },
          },
        },
        groups: account
          ? { where: { group: { companyId: company.id, userId: user.id, accountId: account.id, isArchived: false } }, include: { group: { select: { id: true, name: true, canSend: true, isArchived: true } } } }
          : { where: { groupId: "__NO_CURRENT_WHATSAPP_ACCOUNT__" }, include: { group: { select: { id: true, name: true, canSend: true, isArchived: true } } } },
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    return NextResponse.json({
      categories: categories.map((category) => ({
        ...category,
        assignedGroupCount: category._count.groups,
        assignedContactCount: category._count.contacts,
        totalTargetCount: category._count.groups + category._count.contacts,
      })),
    });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_categories");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const category = await createCategoryWithTargets({ companyId: company.id, userId: user.id }, parsed.data);
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "category.created",
      entityType: "Category",
      entityId: category.id,
      after: { name: category.name, groupCount: category.assignedGroupCount, contactCount: category.assignedContactCount },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (isCategoryTargetError(error)) {
      return NextResponse.json({ error: error.code, message: error.userMessage }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "errors.generic" }, { status: 400 });
  }
}
