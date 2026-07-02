import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { assertGroupsBelongToCurrentAccount, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";

const schema = z.object({ name: z.string().min(2).max(80), description: z.string().max(500).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#f97316"), groupIds: z.array(z.string()).default([]) });

export async function GET(request: Request) {
  try {
    const { company, user } = await requireMobileAuth(request);
    const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
    const categories = await prisma.category.findMany({
      where: { companyId: company.id, archivedAt: null },
      include: {
        _count: { select: { groups: true } },
        groups: account
          ? { where: { group: { companyId: company.id, userId: user.id, accountId: account.id, isArchived: false } }, select: { groupId: true } }
          : { where: { groupId: "__NO_CURRENT_WHATSAPP_ACCOUNT__" }, select: { groupId: true } },
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
        _count: { ...category._count, groups: category.groups.length },
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
    const requestedGroupIds = [...new Set(parsed.data.groupIds)];
    const account = requestedGroupIds.length ? await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id }) : null;
    if (requestedGroupIds.length && !account) return mobileError("WHATSAPP_ACCOUNT_REQUIRED", "WhatsApp hesabınızı bağlayın", { status: 409 });
    const validGroups = account ? await assertGroupsBelongToCurrentAccount({ companyId: company.id, userId: user.id, accountId: account.id }, requestedGroupIds) : [];
    const category = await prisma.category.create({
      data: { companyId: company.id, name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, groups: { create: validGroups.map((group) => ({ groupId: group.id })) } },
      select: { id: true, name: true, color: true, description: true, _count: { select: { groups: true } } },
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.category.created", entityType: "Category", entityId: category.id }).catch((auditError) =>
      console.error("mobile.category.audit_failed", { error: auditError instanceof Error ? auditError.message : String(auditError), categoryId: category.id }),
    );
    return mobileSuccess({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "WHATSAPP_GROUP_OWNERSHIP_MISMATCH") return mobileError("FORBIDDEN", "Bu grup bu hesaba ait değil", { status: 403 });
    return mobileSafeError(error, "Kategori oluşturulamadı.");
  }
}
