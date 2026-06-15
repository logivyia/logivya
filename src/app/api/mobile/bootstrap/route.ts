import { hasPermission, PERMISSIONS } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeSubscription } from "@/server/mobile/subscription";

export async function GET(request: Request) {
  try {
    const { user, company, membership } = await requireMobileAuth(request);
    const [subscription, unreadNotifications, connectedAccounts, featureFlags] = await Promise.all([
      prisma.subscription.findFirst({ where: { companyId: company.id }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
      prisma.notification.count({ where: { companyId: company.id, userId: user.id, isRead: false } }),
      prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, archivedAt: null },
        select: { id: true, label: true, phoneNumber: true, displayName: true, status: true, lastSyncedAt: true, _count: { select: { groups: true, contacts: true } } },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
      prisma.featureFlag.findMany({ where: { isEnabled: true }, select: { key: true, description: true }, take: 50 }),
    ]);
    const subscriptionStatus = serializeSubscription(subscription);
    return mobileSuccess({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, locale: user.locale, timezone: user.timezone },
      company: { id: company.id, name: company.name, defaultLanguage: company.defaultLanguage, defaultTimezone: company.defaultTimezone, defaultCurrency: company.defaultCurrency },
      role: membership.role,
      permissions: PERMISSIONS.filter((permission) => hasPermission(membership.role, permission)),
      subscription: subscriptionStatus,
      trial: { isTrial: subscriptionStatus.isTrial, remainingDays: subscriptionStatus.isTrial ? subscriptionStatus.remainingDays : 0 },
      unreadNotificationsCount: unreadNotifications,
      whatsapp: {
        connectedCount: connectedAccounts.filter((account) => account.status === "CONNECTED").length,
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
