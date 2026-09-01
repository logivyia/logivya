import type { Prisma } from "@prisma/client";
import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeSubscription } from "@/server/mobile/subscription";
import { RECOVERABLE_ACCOUNT_STATUSES } from "@/lib/whatsapp/account-status-machine";
import { logger } from "@/server/observability/logger";
import { requestWhatsAppSessionRestoreForAccounts } from "@/server/whatsapp/session-restore";

export async function GET(request: Request) {
  try {
    const { user, company, membership } = await requireMobileAuth(request);
    const [subscription, unreadNotifications, initialConnectedAccounts, featureFlags] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      prisma.notification.count({ where: { companyId: company.id, userId: user.id, isRead: false } }),
      prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, userId: user.id, archivedAt: null },
        select: {
          id: true,
          userId: true,
          companyId: true,
          label: true,
          phoneNumber: true,
          displayName: true,
          status: true,
          lastError: true,
          lastSyncedAt: true,
          lastHeartbeatAt: true,
          sessionSnapshotAt: true,
          archivedAt: true,
          updatedAt: true,
          _count: { select: { groups: true, contacts: true } },
        },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
      prisma.featureFlag.findMany({ where: { isEnabled: true }, select: { key: true, description: true }, take: 50 }),
    ]);
    let connectedAccounts = initialConnectedAccounts;
    const restoreCount = await requestWhatsAppSessionRestoreForAccounts(connectedAccounts, { companyId: company.id, userId: user.id }, "mobile-bootstrap");
    if (restoreCount) {
      connectedAccounts = await prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, userId: user.id, archivedAt: null },
        select: {
          id: true,
          userId: true,
          companyId: true,
          label: true,
          phoneNumber: true,
          displayName: true,
          status: true,
          lastError: true,
          lastSyncedAt: true,
          lastHeartbeatAt: true,
          sessionSnapshotAt: true,
          archivedAt: true,
          updatedAt: true,
          _count: { select: { groups: true, contacts: true } },
        },
        take: 10,
        orderBy: { createdAt: "desc" },
      });
    }
    const subscriptionStatus = serializeSubscription(subscription?.subscription ?? null);
    const recoverableAccountWhere = {
      companyId: company.id,
      userId: user.id,
      archivedAt: null,
      status: { in: [...RECOVERABLE_ACCOUNT_STATUSES] },
      OR: [{ lastError: null }, { lastError: { notIn: ["WHATSAPP_LOGGED_OUT"] } }],
    } satisfies Prisma.WhatsAppAccountWhereInput;
    const showContacts = subscriptionStatus.entitlements.contactMessaging;
    const [whatsappAccountCount, connectedWhatsAppAccountCount, syncedWhatsAppGroupCount, contactCount] = await Promise.all([
      prisma.whatsAppAccount.count({ where: { companyId: company.id, userId: user.id, archivedAt: null } }),
      prisma.whatsAppAccount.count({ where: recoverableAccountWhere }),
      prisma.whatsAppGroup.count({
        where: {
          companyId: company.id,
          userId: user.id,
          isArchived: false,
          canSend: true,
          account: recoverableAccountWhere,
        },
      }),
      showContacts
        ? prisma.contact.count({
            where: {
              companyId: company.id,
              userId: user.id,
              isActive: true,
              NOT: { displayNameSource: "PHONE_FALLBACK" },
              account: recoverableAccountWhere,
            },
          })
        : Promise.resolve(0),
    ]);
    const isPlatformAdmin = isAuthorizedLogivyaPlatformAdmin({ email: user.email });
    return mobileSuccess({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, locale: user.locale, timezone: user.timezone, role: membership.role, isPlatformAdmin },
      company: { id: company.id, name: company.name, defaultLanguage: company.defaultLanguage, defaultTimezone: company.defaultTimezone, defaultCurrency: company.defaultCurrency },
      role: membership.role,
      isAdmin: isPlatformAdmin,
      isPlatformAdmin,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
      subscription: subscriptionStatus,
      trial: { isTrial: subscriptionStatus.isTrial, remainingDays: subscriptionStatus.isTrial ? subscriptionStatus.remainingDays : 0 },
      unreadNotificationsCount: unreadNotifications,
      whatsapp: {
        connectedCount: connectedWhatsAppAccountCount,
        accounts: connectedAccounts.map((account) => ({
          id: account.id,
          label: account.label,
          phoneNumber: account.phoneNumber,
          displayName: account.displayName,
          status: account.status,
          groupCount: account._count.groups,
          contactCount: account._count.contacts,
          lastSyncedAt: account.lastSyncedAt,
        })),
      },
      dashboardMetrics: {
        whatsappAccountCount,
        connectedWhatsAppAccountCount,
        syncedWhatsAppGroupCount,
        contactCount,
        showContacts,
      },
      featureFlags,
      app: { minimumSupportedVersion: process.env.MOBILE_MIN_SUPPORTED_VERSION || "1.0.0" },
    });
  } catch (error) {
    logger.error("mobile.dashboard.bootstrap_failed", error);
    return mobileSafeError(error);
  }
}
