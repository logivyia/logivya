import { z } from "zod";

import { requirePermission } from "@/server/auth/permissions";
import { createCategoryWithTargets, isCategoryTargetError } from "@/server/categories/category-targets";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { logger } from "@/server/observability/logger";
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
    const { company, user } = await requireMobileAuth(request);
    const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
    const categories = await prisma.category.findMany({
      where: { companyId: company.id, archivedAt: null },
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
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    return mobileSuccess({
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        description: category.description,
        assignedGroupCount: category._count.groups,
        assignedContactCount: category._count.contacts,
        totalTargetCount: category._count.groups + category._count.contacts,
        _count: category._count,
      })),
    });
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
    const category = await createCategoryWithTargets({ companyId: company.id, userId: user.id }, parsed.data);
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.category.created",
      entityType: "Category",
      entityId: category.id,
      after: { groupCount: category.assignedGroupCount, contactCount: category.assignedContactCount },
    }).catch((auditError) =>
      logger.error("mobile.category.audit_failed", auditError, { categoryId: category.id }),
    );
    return mobileSuccess({ category }, { status: 201 });
  } catch (error) {
    if (isCategoryTargetError(error)) return mobileError(error.code, error.userMessage, { status: error.status });
    return mobileSafeError(error, "Kategori oluşturulamadı.");
  }
}
