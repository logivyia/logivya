import type { CompanySecurityStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { adminAuditPrivacyWhere } from "@/server/admin/message-privacy";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { isNonActionableSyntheticTenant, resolveAdminSeatIntegrity } from "@/server/billing/admin-seat-integrity";
import { isCompanySubscriptionActive } from "@/server/billing/company-entitlements";
import { serializeSubscription } from "@/server/billing/subscription-state";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.companies.read", request);
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim();
    const status = params.get("status")?.trim().toUpperCase();
    const createdFrom = parseDate(params.get("dateFrom"));
    const createdTo = parseDate(params.get("dateTo"), true);
    const includeRetired = params.get("includeRetired") === "1";
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
        owner: { select: { id: true, name: true, email: true, phone: true, status: true } },
        billingProfile: true,
        subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 20 },
        trialEntitlements: {
          select: { status: true, decisionCode: true, startedAt: true, endsAt: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
        auditLogs: { where: adminAuditPrivacyWhere(), select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { members: true, accounts: true, payments: true, invoices: true, supportTickets: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const companyIds = companies.map((company) => company.id);
    const [membershipCounts, pendingInvitationCounts, ownerMemberships] = companyIds.length ? await Promise.all([
      prisma.companyUser.groupBy({
        by: ["companyId", "status"],
        where: { companyId: { in: companyIds } },
        _count: { _all: true },
      }),
      prisma.companyInvitation.groupBy({
        by: ["companyId"],
        where: { companyId: { in: companyIds }, status: "PENDING", reservedSeat: true, expiresAt: { gt: new Date() } },
        _count: { _all: true },
      }),
      prisma.companyUser.findMany({
        where: {
          companyId: { in: companyIds },
          userId: { in: companies.map((company) => company.ownerId) },
        },
        select: { companyId: true, userId: true, role: true, status: true, lifecycleState: true },
      }),
    ]) : [[], [], []];

    return NextResponse.json({
      companies: companies.filter((company) => includeRetired || !isNonActionableSyntheticTenant({
        companyName: company.name,
        ownerEmail: company.owner.email,
      })).map((company) => {
        const active = company.subscriptions.find((subscription) => isCompanySubscriptionActive(subscription));
        const current = active ?? company.subscriptions[0];
        const serialized = current ? { ...current, ...serializeSubscription(current) } : null;
        const activeMembers = membershipCounts.find((item) => item.companyId === company.id && item.status === "ACTIVE")?._count._all ?? 0;
        const suspendedMembers = membershipCounts.find((item) => item.companyId === company.id && item.status === "SUSPENDED")?._count._all ?? 0;
        const legacyInvitedMembers = membershipCounts.find((item) => item.companyId === company.id && item.status === "INVITED")?._count._all ?? 0;
        const pendingInvitations = pendingInvitationCounts.find((item) => item.companyId === company.id)?._count._all ?? 0;
        const ownerMembership = ownerMemberships.find((membership) => (
          membership.companyId === company.id
          && membership.userId === company.ownerId
          && membership.role === "OWNER"
          && membership.status === "ACTIVE"
          && membership.lifecycleState === "INDEPENDENT_OWNER"
        ));
        const integrity = resolveAdminSeatIntegrity({
          companyName: company.name,
          ownerEmail: company.owner.email,
          hasOwnerMembership: Boolean(ownerMembership),
          hasActiveSubscription: Boolean(active),
          hasAnySubscription: company.subscriptions.length > 0,
          activePlanSlug: active?.plan.slug,
          activePlanMaxTeamUsers: active?.plan.maxTeamUsers,
          trialEntitlementStatus: company.trialEntitlements[0]?.status,
          activeMembers,
          suspendedMembers,
          invitedMembers: legacyInvitedMembers,
          pendingInvitations,
        });
        const { auditLogs, trialEntitlements, ...publicCompany } = company;
        return {
          ...publicCompany,
          subscriptions: serialized ? [serialized] : [],
          trialState: trialEntitlements[0] ?? null,
          seatUsage: {
            limit: integrity.limit,
            used: integrity.used,
            activeMembers,
            suspendedMembers,
            pendingInvitations: pendingInvitations + legacyInvitedMembers,
            available: integrity.available,
            capacitySource: integrity.capacitySource,
            integrityStatus: integrity.integrityStatus,
            configurationRequired: integrity.configurationRequired,
            reconciliationRequired: integrity.reconciliationRequired,
            ownerRelationshipValid: integrity.ownerRelationshipValid,
          },
          lastActivityAt: auditLogs[0]?.createdAt ?? company.updatedAt,
        };
      }),
      requestId: id,
    });
  } catch (error) {
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}
