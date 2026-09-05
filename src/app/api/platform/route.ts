import { ownedMonthlyMessageMetrics } from "@/server/messages/monthly-metrics";
import { NextResponse } from "next/server";
import { isRecoverableWhatsAppStatus } from "@/lib/whatsapp/account-status-machine";
import { requireApiSession } from "@/server/auth/session";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { requestGroupSyncIfStale, resolveCurrentWhatsAppAccount } from "@/server/whatsapp/account-scope";
import { requestWhatsAppSessionRestoreForAccounts } from "@/server/whatsapp/session-restore";

export async function GET() {
  try {
    const { company, user } = await requireApiSession();
    const scope = { companyId: company.id, userId: user.id };
    const currentAccount = await resolveCurrentWhatsAppAccount(scope);
    if (currentAccount) {
      void requestGroupSyncIfStale(scope, currentAccount, "platform");
    }

    const [initialAccounts, groups, rawCategories, campaigns, subscription, onboarding, announcements, monthlyMessages] = await Promise.all([
      prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, userId: user.id },
        include: {
          _count: { select: { groups: true, contacts: { where: { isActive: true, isWhatsAppUser: true, NOT: { displayNameSource: "PHONE_FALLBACK" } } } } },
          sessions: { orderBy: { updatedAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      currentAccount
        ? prisma.whatsAppGroup.findMany({
            where: {
              companyId: company.id,
              userId: user.id,
              accountId: currentAccount.id,
              isArchived: false,
              account: { id: currentAccount.id, companyId: company.id, userId: user.id, archivedAt: null },
            },
            include: {
              account: { select: { id: true, label: true, phoneNumber: true, status: true, archivedAt: true, lastError: true } },
              categories: { include: { category: true } },
            },
            orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
            take: 1000,
          })
        : Promise.resolve([]),
      prisma.category.findMany({
        where: { companyId: company.id, archivedAt: null },
        include: {
          _count: {
            select: {
              groups: currentAccount
                ? { where: { group: { companyId: company.id, userId: user.id, accountId: currentAccount.id, isArchived: false } } }
                : { where: { groupId: "__NO_CURRENT_WHATSAPP_ACCOUNT__" } },
              contacts: currentAccount
                ? { where: { companyId: company.id, userId: user.id, accountId: currentAccount.id, contact: { isActive: true, isWhatsAppUser: true } } }
                : { where: { id: "__NO_CURRENT_WHATSAPP_ACCOUNT__" } },
            },
          },
          groups: currentAccount
            ? {
                where: { group: { companyId: company.id, userId: user.id, accountId: currentAccount.id, isArchived: false } },
                select: { groupId: true },
              }
            : { where: { groupId: "__NO_CURRENT_WHATSAPP_ACCOUNT__" }, select: { groupId: true } },
        },
        orderBy: { name: "asc" },
        take: 200,
      }),
      prisma.messageCampaign.findMany({ where: { companyId: company.id, createdById: user.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
      subscriptionAccess.getCurrent(company.id),
      prisma.onboardingChecklist.findUnique({ where: { companyId: company.id } }),
      prisma.announcement.findMany({
        where: { isActive: true, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
        orderBy: { startsAt: "desc" },
        take: 3,
      }),
      ownedMonthlyMessageMetrics(company.id, user.id, company.defaultTimezone),
    ]);
    let accounts = initialAccounts;
    const restoreCount = await requestWhatsAppSessionRestoreForAccounts(
      accounts.filter((account) => !account.archivedAt),
      { companyId: company.id, userId: user.id },
      "platform-bootstrap",
    );
    if (restoreCount) {
      accounts = await prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, userId: user.id },
        include: {
          _count: { select: { groups: true, contacts: { where: { isActive: true, isWhatsAppUser: true, NOT: { displayNameSource: "PHONE_FALLBACK" } } } } },
          sessions: { orderBy: { updatedAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }

    const visibleGroups = groups
      .filter((group) => isRecoverableWhatsAppStatus(group.account.status, group.account.lastError))
      .map((group) => ({ ...group, canSend: true }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const categories = rawCategories.map((category) => ({
      ...category,
      assignedGroupCount: category._count.groups,
      assignedContactCount: category._count.contacts,
      totalTargetCount: category._count.groups + category._count.contacts,
    }));

    logger.info("whatsapp.group_listing.platform", {
      userId: user.id,
      companyId: company.id,
      whatsappAccountId: currentAccount?.id ?? null,
      returnedGroupCount: visibleGroups.length,
    });

    return NextResponse.json({
      user: { id: user.id, name: user.name },
      company: { id: company.id, name: company.name },
      monthlyMessages,
      accounts: accounts.map(account => ({ id: account.id, label: account.label, phoneNumber: account.phoneNumber, displayName: account.displayName, status: account.status, archivedAt: account.archivedAt, lastSyncedAt: account.lastSyncedAt, _count: account._count, sessions: account.sessions.map(session => ({ qrCode: session.qrCode, expiresAt: session.expiresAt })) })),
      currentWhatsAppAccount: currentAccount
        ? { id: currentAccount.id, phoneNumber: currentAccount.phoneNumber, status: currentAccount.status, lastGroupSyncAt: currentAccount.lastGroupSyncAt }
        : null,
      groups: visibleGroups,
      categories,
      campaigns,
      subscription: subscription?.subscription ?? null,
      entitlements: subscription?.entitlements ?? null,
      onboarding,
      announcements,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    logger.error("platform.bootstrap_failed", error);
    return NextResponse.json({ error: "PLATFORM_BOOTSTRAP_FAILED" }, { status: 500 });
  }
}
