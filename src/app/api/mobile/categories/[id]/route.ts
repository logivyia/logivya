import { z } from "zod";

import { requirePermission } from "@/server/auth/permissions";
import { isCategoryTargetError, updateCategoryWithTargets } from "@/server/categories/category-targets";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
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
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_categories");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await params;
    const category = await updateCategoryWithTargets({ companyId: company.id, userId: user.id }, id, parsed.data);
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "mobile.category.updated",
      entityType: "Category",
      entityId: id,
      after: { groupCount: category.assignedGroupCount, contactCount: category.assignedContactCount },
    }).catch((auditError) =>
      console.error("mobile.category.audit_failed", { error: auditError instanceof Error ? auditError.message : String(auditError), categoryId: id }),
    );
    return mobileSuccess({ category });
  } catch (error) {
    if (isCategoryTargetError(error)) return mobileError(error.code, error.userMessage, { status: error.status });
    return mobileSafeError(error, "Kategori güncellenemedi.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_categories");
    const { id } = await params;
    const updated = await prisma.category.updateMany({ where: { id, companyId: company.id }, data: { archivedAt: new Date() } });
    if (!updated.count) return mobileError("NOT_FOUND", "Kategori bulunamadı.", { status: 404 });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.category.archived", entityType: "Category", entityId: id }).catch((auditError) =>
      console.error("mobile.category.audit_failed", { error: auditError instanceof Error ? auditError.message : String(auditError), categoryId: id }),
    );
    return mobileSuccess({ archived: true });
  } catch (error) {
    return mobileSafeError(error, "Kategori silinemedi.");
  }
}
