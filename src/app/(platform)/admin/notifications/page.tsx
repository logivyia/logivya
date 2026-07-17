import { AdminCenter, AdminTable } from "@/components/admin-center";
import { AdminNotificationOperations } from "@/components/admin-notification-operations";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { NOTIFICATION_EVENT_REGISTRY } from "@/server/notifications/registry";

export default async function Page() {
  await requirePlatformAdmin("platform:read");
  const { locale, t } = await getServerTranslator();
  const [rows, eventCount, deliveryCount, failedDeliveryCount, queuedCount, deadLetters, templates] = await Promise.all([
    prisma.notification.findMany({ include: { company: { select: { name: true } }, user: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.notificationEvent.count(),
    prisma.notificationDelivery.count(),
    prisma.notificationDelivery.count({ where: { status: { in: ["FAILED", "BOUNCED", "REJECTED", "DEAD_LETTERED"] } } }),
    prisma.notificationOutbox.count({ where: { status: { in: ["PENDING", "QUEUED", "PROCESSING"] } } }),
    prisma.notificationDeadLetter.findMany({ where: { resolvedAt: null }, include: { event: { select: { type: true } } }, orderBy: { deadLetteredAt: "desc" }, take: 100 }),
    prisma.notificationTemplate.count({ where: { isActive: true, status: "APPROVED" } }),
  ]);

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
        headers={[t("adminNotifications.type"), t("adminNotifications.heading"), t("common.company"), t("users.user"), t("adminNotifications.read"), t("admin.list.date")]}
        rows={rows.map((x) => [
          t(`notification.type.${x.type}`),
          t(`notification.title.${x.type}`),
          x.company.name,
          x.user.email,
          x.isRead ? t("common.yes") : t("common.no"),
          formatDateTime(x.createdAt, locale),
        ])}
      />
      <div className="mt-6">
        <AdminNotificationOperations eventTypes={Object.keys(NOTIFICATION_EVENT_REGISTRY)} deadLetters={deadLetters.map((item) => ({ id: item.id, eventType: item.event.type, channel: item.channel, errorCode: item.errorCode, attempts: item.attemptCount, createdAt: formatDateTime(item.deadLetteredAt, locale) }))} />
      </div>
    </AdminCenter>
  );
}
