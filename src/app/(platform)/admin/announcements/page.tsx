import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:manage");
  const { locale, t } = await getServerTranslator();
  const rows = await prisma.announcement.findMany({ orderBy: { startsAt: "desc" }, take: 100 });
  return <AdminCenter eyebrow={t("adminAnnouncements.eyebrow")} title={t("adminAnnouncements.title")} description={t("adminAnnouncements.description")} metrics={{ [t("adminAnnouncements.total")]: rows.length, [t("status.active")]: rows.filter((row) => row.isActive).length, [t("adminAnnouncements.maintenance")]: rows.filter((row) => row.type === "MAINTENANCE").length, [t("adminAnnouncements.warning")]: rows.filter((row) => row.type === "WARNING").length }}><AdminTable emptyLabel={t("admin.list.empty")} headers={[t("adminNotifications.heading"), t("adminNotifications.type"), t("status.active"), t("adminSubscriptions.start"), t("adminSubscriptions.end")]} rows={rows.map((row) => [row.title, t(`announcement.type.${row.type.toLowerCase()}`), row.isActive ? t("common.yes") : t("common.no"), formatDateTime(row.startsAt, locale), row.endsAt ? formatDateTime(row.endsAt, locale) : "-"])}/></AdminCenter>;
}
