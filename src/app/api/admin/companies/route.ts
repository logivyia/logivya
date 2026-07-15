import type { CompanySecurityStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { isCompanySubscriptionActive } from "@/server/billing/company-entitlements";
import { corePlanRule } from "@/server/billing/plan-matrix";
import { serializeSubscription } from "@/server/billing/subscription-state";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.companies.read", request);
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim();
    const status = params.get("status")?.trim().toUpperCase();
    const createdFrom = parseDate(params.get("dateFrom"));
    const createdTo = parseDate(params.get("dateTo"), true);
    const where: Prisma.CompanyWhereInput = {
        ...(status && ["ACTIVE", "UNDER_INVESTIGATION", "DISABLED"].includes(status) ? { securityStatus: status as CompanySecurityStatus } : {}),
        ...(createdFrom || createdTo ? { createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } } : {}),
        ...(query ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
            { owner: { name: { contains: query, mode: "insensitive" } } },
            { owner: { email: { contains: query, mode: "insensitive" } } },
            { owner: { phone: { contains: query, mode: "insensitive" } } },
          ],
        } : {}),
      };
    const companies = await prisma.company.findMany({
      where,
      include: {
        owner: { select: { name: true, email: true, phone: true } },
        billingProfile: true,
        subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 20 },
        auditLogs: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { members: true, accounts: true, groups: true, contacts: true, campaigns: true, payments: true, invoices: true, supportTickets: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const companyIds = companies.map((company) => company.id);
    const [membershipCounts, pendingInvitationCounts] = companyIds.length ? await Promise.all([
      prisma.companyUser.groupBy({
        by: ["companyId", "status"],
        where: { companyId: { in: companyIds } },
        _count: { _all: true },
      }),
      prisma.companyInvitation.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companyIds }, status: "PENDING", expiresAt: { gt: new Date() } },
        _count: { _all: true },
      }),
    ]) : [[], []];

    return NextResponse.json({
      companies: companies.map((company) => {
        const current = company.subscriptions.find((subscription) => isCompanySubscriptionActive(subscription)) ?? company.subscriptions[0];
        const serialized = current ? { ...current, ...serializeSubscription(current) } : null;
        const activeMembers = membershipCounts.find((item) => item.companyId === company.id && item.status === "ACTIVE")?._count._all ?? 0;
        const legacyInvitedMembers = membershipCounts.find((item) => item.companyId === company.id && item.status === "INVITED")?._count._all ?? 0;
        const pendingInvitations = pendingInvitationCounts.find((item) => item.companyId === company.id)?._count._all ?? 0;
        const limit = serialized?.isActive ? corePlanRule(current?.plan.slug)?.totalUserSeats ?? current?.plan.maxTeamUsers ?? 0 : 0;
        const used = activeMembers + legacyInvitedMembers + pendingInvitations;
        return {
          ...company,
          subscriptions: serialized ? [serialized] : [],
          seatUsage: {
            limit,
            used,
            activeMembers,
            pendingInvitations: pendingInvitations + legacyInvitedMembers,
            available: Math.max(0, limit - used),
            reconciliationRequired: used > limit,
          },
          lastActivityAt: company.auditLogs[0]?.createdAt ?? company.updatedAt,
        };
      }),
    });
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}
