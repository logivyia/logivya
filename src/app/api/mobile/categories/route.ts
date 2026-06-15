import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ name: z.string().min(2).max(80), description: z.string().max(500).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#f97316"), groupIds: z.array(z.string()).default([]) });

export async function GET(request: Request) {
  try {
    const { company } = await requireMobileAuth(request);
    const categories = await prisma.category.findMany({
      where: { companyId: company.id, archivedAt: null },
      select: { id: true, name: true, color: true, description: true, _count: { select: { groups: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    return mobileSuccess({ categories });
  } catch (error) {
    return mobileSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_categories");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const validGroups = await prisma.whatsAppGroup.findMany({ where: { companyId: company.id, id: { in: parsed.data.groupIds } }, select: { id: true } });
    const category = await prisma.category.create({ data: { companyId: company.id, name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, groups: { create: validGroups.map((group) => ({ groupId: group.id })) } } });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.category.created", entityType: "Category", entityId: category.id });
    return mobileSuccess({ category }, { status: 201 });
  } catch (error) {
    return mobileSafeError(error, "Kategori oluşturulamadı.");
  }
}
