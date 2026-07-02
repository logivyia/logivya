import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { assertGroupsBelongToCurrentAccount, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";

const schema = z.object({ groupIds: z.array(z.string()).max(5000) });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, user } = await requireApiSession();
    const account = await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id });
    const category = await prisma.category.findFirst({
      where: { id, companyId: company.id, archivedAt: null },
      include: {
        groups: account
          ? { where: { group: { companyId: company.id, userId: user.id, accountId: account.id, isArchived: false } }, include: { group: true } }
          : { where: { groupId: "__NO_CURRENT_WHATSAPP_ACCOUNT__" }, include: { group: true } },
      },
    });
    if (!category) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ category, groups: category.groups.map((item) => item.group) });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { company, membership, user } = await requireApiSession();
    requirePermission(membership.role, "manage_categories");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "validation.invalid" }, { status: 400 });
    const category = await prisma.category.findFirst({ where: { id, companyId: company.id, archivedAt: null } });
    if (!category) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const requestedGroupIds = [...new Set(parsed.data.groupIds)];
    const account = requestedGroupIds.length ? await resolveCurrentWhatsAppAccount({ companyId: company.id, userId: user.id }) : null;
    if (requestedGroupIds.length && !account) return NextResponse.json({ error: "WhatsApp hesabınızı bağlayın" }, { status: 409 });
    const groups = account ? await assertGroupsBelongToCurrentAccount({ companyId: company.id, userId: user.id, accountId: account.id }, requestedGroupIds) : [];

    await prisma.categoryGroup.createMany({ data: groups.map((group) => ({ categoryId: id, groupId: group.id })), skipDuplicates: true });
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "category.groups.added", entityType: "Category", entityId: id, after: { groupIds: groups.map((group) => group.id) } });
    return NextResponse.json({ ok: true, count: groups.length });
  } catch (error) {
    const ownershipMismatch = error instanceof Error && error.message === "WHATSAPP_GROUP_OWNERSHIP_MISMATCH";
    return NextResponse.json({ error: ownershipMismatch ? "Bu grup bu hesaba ait değil" : error instanceof Error ? error.message : "errors.generic" }, { status: ownershipMismatch ? 403 : 400 });
  }
}
