import type { CompanySecurityStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { adminAuditPrivacyWhere } from "@/server/admin/message-privacy";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { resolveAdminSeatIntegrity } from "@/server/billing/admin-seat-integrity";
import { isCompanySubscriptionActive } from "@/server/billing/company-entitlements";
import { serializeSubscription } from "@/server/billing/subscription-state";
import { prisma } from "@/server/db";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const { platformAdmin } = await requirePlatformAdmin(
      "admin.companies.read",
      request,
    );
    const can = (permission: string) =>
      hasAdminPermission(
        platformAdmin.role,
        platformAdmin.permissions,
        permission,
      );
    const canReadUsers = can("admin.users.read");
    const canReadBilling = can("admin.billing.read");
    const canReadWhatsApp = can("admin.whatsapp.read");
    const canReadAudit = can("admin.audit.read");
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim();
    const status = params.get("status")?.trim().toUpperCase();
    const createdFrom = parseDate(params.get("dateFrom"));
    const createdTo = parseDate(params.get("dateTo"), true);
    const includeRetired = params.get("includeRetired") === "1";
    const page = positiveInteger(params.get("page"), 1);
    const pageSize = Math.min(100, positiveInteger(params.get("pageSize"), 50));
    const retiredTenantWhere: Prisma.CompanyWhereInput = {
      AND: [
        {
          OR: ["retired", "smoke", "proof", "test"].map((marker) => ({
            name: { contains: marker, mode: "insensitive" as const },
          })),
        },
        {
          OR: [
            {
              owner: {
                email: { endsWith: ".invalid", mode: "insensitive" },
              },
            },
            {
              owner: {
                email: { contains: "@invalid.", mode: "insensitive" },
              },
            },
            {
              owner: {
                email: { endsWith: ".example", mode: "insensitive" },
              },
            },
            {
              owner: {
                email: {
                  contains: "retired-auth-smoke",
                  mode: "insensitive",
                },
              },
            },
          ],
        },
      ],
    };
    const subscriptionStatus = params.get("subscriptionStatus");
    const billingFilters: Prisma.CompanyWhereInput[] = canReadBilling ? [
      ...(["ACTIVE", "TRIALING", "EXPIRED", "SUSPENDED", "CANCELED"].includes(subscriptionStatus ?? "") ? [{ subscriptions: { some: { status: subscriptionStatus as "ACTIVE" } } }] : []),
      ...(params.get("billingIncomplete") === "1" ? [{ billingProfile: { is: null } }] : []),
      ...(params.get("expiring") === "1" ? [{ subscriptions: { some: { status: "ACTIVE" as const, currentPeriodEndsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) } } } }] : []),
    ] : [];
    const where: Prisma.CompanyWhereInput = {
      ...(billingFilters.length ? { AND: billingFilters } : {}),
      ...(status &&
      ["ACTIVE", "UNDER_INVESTIGATION", "DISABLED"].includes(status)
        ? { securityStatus: status as CompanySecurityStatus }
        : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lte: createdTo } : {}),
            },
          }
        : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              ...(canReadBilling
                ? [
                    {
                      email: { contains: query, mode: "insensitive" as const },
                    },
                    {
                      phone: { contains: query, mode: "insensitive" as const },
                    },
                  ]
                : []),
              ...(canReadUsers
                ? [
                    {
                      owner: {
                        name: { contains: query, mode: "insensitive" as const },
                      },
                    },
                    {
                      owner: {
                        email: {
                          contains: query,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                    {
                      owner: {
                        phone: {
                          contains: query,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
      ...(!includeRetired ? { NOT: retiredTenantWhere } : {}),
    };

    const [companies, total, active, disabled, memberCount] = await Promise.all(
      [
        prisma.company.findMany({
          where,
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                status: true,
              },
            },
            subscriptions: {
              include: { plan: true },
              orderBy: { createdAt: "desc" },
              take: canReadBilling ? 20 : 0,
            },
            billingProfile: canReadBilling
              ? { select: { legalName: true, billingEmail: true } }
              : false,
            trialEntitlements: {
              select: {
                status: true,
                decisionCode: true,
                startedAt: true,
                endsAt: true,
                createdAt: true,
              },
              orderBy: { createdAt: "asc" },
              take: canReadBilling ? 1 : 0,
            },
            auditLogs: canReadAudit
              ? {
                  where: adminAuditPrivacyWhere(),
                  select: { createdAt: true },
                  orderBy: { createdAt: "desc" },
                  take: 1,
                }
              : false,
            _count: {
              select: {
                members: canReadUsers,
                accounts: canReadWhatsApp,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.company.count({ where }),
        prisma.company.count({
          where: { AND: [where, { securityStatus: "ACTIVE" }] },
        }),
        prisma.company.count({
          where: { AND: [where, { securityStatus: "DISABLED" }] },
        }),
        canReadUsers
          ? prisma.companyUser.count({ where: { company: { is: where } } })
          : Promise.resolve(null),
      ],
    );

    const [activeSubscriptionCompanies, trialCompanies, incompleteBilling] =
      canReadBilling
        ? await Promise.all([
            prisma.company.count({
              where: {
                AND: [where, { subscriptions: { some: { status: "ACTIVE" } } }],
              },
            }),
            prisma.company.count({
              where: {
                AND: [
                  where,
                  { subscriptions: { some: { status: "TRIALING" } } },
                ],
              },
            }),
            prisma.company.count({
              where: { AND: [where, { billingProfile: { is: null } }] },
            }),
          ])
        : [null, null, null];

    const companyIds = companies.map((company) => company.id);
    const [membershipCounts, pendingInvitationCounts, ownerMemberships] =
      canReadBilling && companyIds.length
        ? await Promise.all([
            prisma.companyUser.groupBy({
              by: ["companyId", "status"],
              where: { companyId: { in: companyIds } },
              _count: { _all: true },
            }),
            prisma.companyInvitation.groupBy({
              by: ["companyId"],
              where: {
                companyId: { in: companyIds },
                status: "PENDING",
                reservedSeat: true,
                expiresAt: { gt: new Date() },
              },
              _count: { _all: true },
            }),
            prisma.companyUser.findMany({
              where: {
                companyId: { in: companyIds },
                userId: { in: companies.map((company) => company.ownerId) },
              },
              select: {
                companyId: true,
                userId: true,
                role: true,
                status: true,
                lifecycleState: true,
              },
            }),
          ])
        : [[], [], []];

    return NextResponse.json({
      companies: companies.map((company) => {
        const activeSubscription = company.subscriptions.find((subscription) =>
          isCompanySubscriptionActive(subscription),
        );
        const currentSubscription =
          activeSubscription ?? company.subscriptions[0];
        const serialized = currentSubscription
          ? {
              ...currentSubscription,
              ...serializeSubscription(currentSubscription),
            }
          : null;
        const activeMembers =
          membershipCounts.find(
            (item) => item.companyId === company.id && item.status === "ACTIVE",
          )?._count._all ?? 0;
        const suspendedMembers =
          membershipCounts.find(
            (item) =>
              item.companyId === company.id && item.status === "SUSPENDED",
          )?._count._all ?? 0;
        const legacyInvitedMembers =
          membershipCounts.find(
            (item) =>
              item.companyId === company.id && item.status === "INVITED",
          )?._count._all ?? 0;
        const pendingInvitations =
          pendingInvitationCounts.find((item) => item.companyId === company.id)
            ?._count._all ?? 0;
        const ownerMembership = ownerMemberships.find(
          (membership) =>
            membership.companyId === company.id &&
            membership.userId === company.ownerId &&
            membership.role === "OWNER" &&
            membership.status === "ACTIVE" &&
            membership.lifecycleState === "INDEPENDENT_OWNER",
        );
        const integrity = resolveAdminSeatIntegrity({
          companyName: company.name,
          ownerEmail: company.owner.email,
          hasOwnerMembership: Boolean(ownerMembership),
          hasActiveSubscription: Boolean(activeSubscription),
          hasAnySubscription: company.subscriptions.length > 0,
          activePlanSlug: activeSubscription?.plan.slug,
          activePlanMaxTeamUsers: activeSubscription?.plan.maxTeamUsers,
          trialEntitlementStatus: company.trialEntitlements[0]?.status,
          activeMembers,
          suspendedMembers,
          invitedMembers: legacyInvitedMembers,
          pendingInvitations,
        });

        return {
          id: company.id,
          name: company.name,
          ...(canReadBilling
            ? {
                email: company.email,
                phone: company.phone,
                billingProfile: company.billingProfile,
              }
            : {}),
          securityStatus: company.securityStatus,
          createdAt: company.createdAt,
          owner: {
            name: company.owner.name,
            ...(canReadUsers
              ? {
                  email: company.owner.email,
                  phone: company.owner.phone,
                  status: company.owner.status,
                }
              : {}),
          },
          subscriptions:
            canReadBilling && serialized
              ? [
                  {
                    id: currentSubscription!.id,
                    status: serialized.status,
                    startsAt: serialized.startsAt,
                    endsAt: serialized.endsAt,
                    trialStartsAt: serialized.trialStartsAt,
                    trialEndsAt: serialized.trialEndsAt,
                    currentPeriodEndsAt:
                      currentSubscription!.currentPeriodEndsAt,
                    remainingDays: serialized.remainingDays,
                    trialDurationDays: serialized.trialDurationDays,
                    isActive: serialized.isActive,
                    plan: {
                      name: currentSubscription!.plan.name,
                      slug: currentSubscription!.plan.slug,
                      trialDays: currentSubscription!.plan.trialDays,
                    },
                  },
                ]
              : [],
          seatUsage: canReadBilling
            ? {
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
              }
            : null,
          trialState:
            canReadBilling && company.trialEntitlements[0]
              ? company.trialEntitlements[0]
              : null,
          whatsAppAccountCount: canReadWhatsApp
            ? company._count.accounts
            : null,
          lastActivityAt: canReadAudit
            ? (company.auditLogs[0]?.createdAt ?? company.updatedAt)
            : null,
        };
      }),
      metrics: {
        total,
        active,
        disabled,
        members: memberCount,
        activeSubscriptionCompanies,
        trialCompanies,
        incompleteBillingProfiles: incompleteBilling,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
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
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value))
    date.setUTCHours(23, 59, 59, 999);
  return date;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
