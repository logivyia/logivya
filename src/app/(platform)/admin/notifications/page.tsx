import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("platform:read");
  const { locale, t } = await getServerTranslator();
  const rows = await prisma.notification.findMany({
    include: { company: { select: { name: true } }, user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminCenter
      eyebrow={t("adminNotifications.eyebrow")}
      title={t("adminNotifications.title")}
      description={t("adminNotifications.description")}
      metrics={{
        [t("adminNotifications.shown")]: rows.length,
        [t("adminNotifications.unread")]: rows.filter((x) => !x.isRead).length,
        [t("adminNotifications.security")]: rows.filter((x) => x.type.includes("SECURITY")).length,
        [t("adminNotifications.billing")]: rows.filter((x) => x.type.includes("PAYMENT") || x.type.includes("INVOICE")).length,
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
    </AdminCenter>
  );
}
