import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeSubscription } from "@/server/mobile/subscription";
import { isRecoverableWhatsAppStatus } from "@/lib/whatsapp/account-status-machine";

export async function GET(request: Request) {
  try {
    const { user, company, membership } = await requireMobileAuth(request);
    const [subscription, unreadNotifications, connectedAccounts, featureFlags] = await Promise.all([
      subscriptionAccess.getCurrent(company.id),
      prisma.notification.count({ where: { companyId: company.id, userId: user.id, isRead: false } }),
      prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, userId: user.id, archivedAt: null },
        select: { id: true, label: true, phoneNumber: true, displayName: true, status: true, lastError: true, lastSyncedAt: true, _count: { select: { groups: true, contacts: true } } },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
      prisma.featureFlag.findMany({ where: { isEnabled: true }, select: { key: true, description: true }, take: 50 }),
    ]);
    const subscriptionStatus = serializeSubscription(subscription?.subscription ?? null);
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
        connectedCount: connectedAccounts.filter((account) => isRecoverableWhatsAppStatus(account.status, account.lastError)).length,
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
      featureFlags,
      app: { minimumSupportedVersion: process.env.MOBILE_MIN_SUPPORTED_VERSION || "1.0.0" },
    });
  } catch (error) {
    return mobileSafeError(error);
  }
}
