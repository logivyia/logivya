import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    const { company, user } = await requireApiSession();
    const [accounts, groups, categories, campaigns, subscription] = await Promise.all([
      prisma.whatsAppAccount.findMany({
        where: { companyId: company.id },
        include: { _count: { select: { groups: true, contacts: true } }, sessions: { orderBy: { updatedAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" }, take: 100,
      }),
      prisma.whatsAppGroup.findMany({ where: { companyId: company.id, isArchived: false }, include: { account: { select: { label: true } }, categories: { include: { category: true } } }, orderBy: { name: "asc" }, take: 1000 }),
      prisma.category.findMany({ where: { companyId: company.id, archivedAt: null }, include: { _count: { select: { groups: true } }, groups: { select: { groupId: true } } }, orderBy: { name: "asc" }, take: 200 }),
      prisma.messageCampaign.findMany({ where: { companyId: company.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.subscription.findFirst({ where: { companyId: company.id }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
    ]);
    return NextResponse.json({ user: { name: user.name }, company: { name: company.name }, accounts, groups, categories, campaigns, subscription });
  } catch { return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }); }
}
