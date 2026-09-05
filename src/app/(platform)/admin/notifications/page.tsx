import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
import { AdminNotificationOperations } from "@/components/admin-notification-operations";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator, loadServerDictionary } from "@/i18n/server";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import {
  ADMIN_TABLE_PAGE_SIZE,
  adminPageCount,
  normalizeAdminPage,
} from "@/server/admin/pagination";
import { prisma } from "@/server/db";
import { NOTIFICATION_EVENT_REGISTRY } from "@/server/notifications/registry";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { platformAdmin } = await requirePlatformAdmin(
    "admin.notifications.read",
  );
  const { locale, t } = await getServerTranslator();
  const dictionary = await loadServerDictionary(locale);
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [
    notificationCount,
    eventCount,
    deliveryCount,
    failedDeliveryCount,
    queuedCount,
    deadLetters,
    templates,
  ] = await Promise.all([
    prisma.notification.count(),
    prisma.notificationEvent.count(),
    prisma.notificationDelivery.count(),
    prisma.notificationDelivery.count({
      where: {
        status: { in: ["FAILED", "BOUNCED", "REJECTED", "DEAD_LETTERED"] },
      },
    }),
    prisma.notificationOutbox.count({
      where: { status: { in: ["PENDING", "QUEUED", "PROCESSING"] } },
    }),
    prisma.notificationDeadLetter.findMany({
      where: { resolvedAt: null },
      include: { event: { select: { type: true } } },
      orderBy: { deadLetteredAt: "desc" },
      take: 100,
    }),
    prisma.notificationTemplate.count({
      where: { isActive: true, status: "APPROVED" },
    }),
  ]);
  const pages = adminPageCount(notificationCount);
  const page = Math.min(requestedPage, pages);
  const rows = await prisma.notification.findMany({
    include: {
      company: { select: { name: true } },
      user: { select: { email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });

  return (
    <AdminCenter
      eyebrow={t("adminNotifications.eyebrow")}
      title={t("adminNotifications.title")}
      description={t("adminNotifications.description")}
      metrics={{
        [t("adminNotifications.shown")]: eventCount,
        [t("adminNotifications.unread")]: queuedCount,
        [t("adminNotifications.security")]: failedDeliveryCount,
        [t("adminNotifications.billing")]: `${deliveryCount} / ${templates}`,
      }}
    >
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("adminNotifications.type"),
          t("adminNotifications.heading"),
          t("common.company"),
          t("users.user"),
          t("adminNotifications.read"),
          t("admin.list.date"),
        ]}
        rows={rows.map((x) => [
          dictionary[`notification.type.${x.type}`] ??
            dictionary[`notification.title.${x.type}`] ??
            readableEventType(x.type),
          x.title,
          x.company.name,
          x.user.email,
          x.isRead ? t("common.yes") : t("common.no"),
          formatDateTime(x.createdAt, locale),
        ])}
      />
      <AdminPagination
        page={page}
        pages={pages}
        previousLabel={locale === "tr" ? "Önceki" : "Previous"}
        nextLabel={locale === "tr" ? "Sonraki" : "Next"}
        pageLabel={locale === "tr" ? "Sayfa" : "Page"}
      />
      <div className="mt-6">
        <AdminNotificationOperations
          canManage={hasAdminPermission(
            platformAdmin.role,
            platformAdmin.permissions,
            "admin.notifications.update",
          )}
          eventTypes={Object.keys(NOTIFICATION_EVENT_REGISTRY)}
          deadLetters={deadLetters.map((item) => ({
            id: item.id,
            eventType: item.event.type,
            channel: item.channel,
            errorCode: item.errorCode,
            attempts: item.attemptCount,
            createdAt: formatDateTime(item.deadLetteredAt, locale),
          }))}
        />
      </div>
    </AdminCenter>
  );
}

function readableEventType(type: string) {
  return type
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-US"));
}
