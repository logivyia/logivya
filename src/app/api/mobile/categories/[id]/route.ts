import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileError, mobileSafeError, mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { writeAuditLog } from "@/server/security/audit";
import { assertGroupsBelongToCurrentAccount, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";

const schema = z.object({ name: z.string().min(2).max(80).optional(), description: z.string().max(500).nullable().optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), groupIds: z.array(z.string()).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { company, membership, user } = await requireMobileAuth(request);
    requirePermission(membership.role, "manage_categories");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { id } = await params;
    const existing = await prisma.category.findFirst({ where: { id, companyId: company.id } });
    if (!existing) return mobileError("NOT_FOUND", "Kategori bulunamadı.", { status: 404 });
    const category = await prisma.$transaction(async (tx) => {
      if (parsed.data.groupIds) {
        const requestedGroupIds = [...new Set(parsed.data.groupIds)];
        const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
        if (!account) throw new Error("WHATSAPP_ACCOUNT_REQUIRED");
        const validGroups = await assertGroupsBelongToCurrentAccount({ companyId: company.id, userId: user.id, accountId: account.id }, requestedGroupIds);
        await tx.categoryGroup.deleteMany({ where: { categoryId: id, group: { companyId: company.id, userId: user.id, accountId: account.id } } });
        await tx.categoryGroup.createMany({ data: validGroups.map((group) => ({ categoryId: id, groupId: group.id })), skipDuplicates: true });
      }
      return tx.category.update({
        where: { id },
        data: { name: parsed.data.name, description: parsed.data.description, color: parsed.data.color },
        select: { id: true, name: true, color: true, description: true, _count: { select: { groups: true } } },
      });
    });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "mobile.category.updated", entityType: "Category", entityId: id }).catch((auditError) =>
      console.error("mobile.category.audit_failed", { error: auditError instanceof Error ? auditError.message : String(auditError), categoryId: id }),
    );
    return mobileSuccess({ category });
  } catch (error) {
    if (error instanceof Error && error.message === "WHATSAPP_ACCOUNT_REQUIRED") return mobileError("WHATSAPP_ACCOUNT_REQUIRED", "WhatsApp hesabınızı bağlayın", { status: 409 });
    if (error instanceof Error && error.message === "WHATSAPP_GROUP_OWNERSHIP_MISMATCH") return mobileError("FORBIDDEN", "Bu grup bu hesaba ait değil", { status: 403 });
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
