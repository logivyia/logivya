import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import {
  ADMIN_TABLE_PAGE_SIZE,
  adminPageCount,
  normalizeAdminPage,
} from "@/server/admin/pagination";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePlatformAdmin("admin.notifications.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [total, active, maintenance, warning] = await Promise.all([
    prisma.announcement.count(),
    prisma.announcement.count({ where: { isActive: true } }),
    prisma.announcement.count({ where: { type: "MAINTENANCE" } }),
    prisma.announcement.count({ where: { type: "WARNING" } }),
  ]);
  const pages = adminPageCount(total);
  const page = Math.min(requestedPage, pages);
  const rows = await prisma.announcement.findMany({
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });
  return (
    <AdminCenter
      eyebrow={t("adminAnnouncements.eyebrow")}
      title={t("adminAnnouncements.title")}
      description={t("adminAnnouncements.description")}
      metrics={{
        [t("adminAnnouncements.total")]: total,
        [t("status.active")]: active,
        [t("adminAnnouncements.maintenance")]: maintenance,
        [t("adminAnnouncements.warning")]: warning,
      }}
    >
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("adminNotifications.heading"),
          t("adminNotifications.type"),
          t("status.active"),
          t("adminSubscriptions.start"),
          t("adminSubscriptions.end"),
        ]}
        rows={rows.map((row) => [
          row.title,
          t(`announcement.type.${row.type.toLowerCase()}`),
          row.isActive ? t("common.yes") : t("common.no"),
          formatDateTime(row.startsAt, locale),
          row.endsAt ? formatDateTime(row.endsAt, locale) : "-",
        ])}
      />
      <AdminPagination
        page={page}
        pages={pages}
        previousLabel={locale === "tr" ? "Önceki" : "Previous"}
        nextLabel={locale === "tr" ? "Sonraki" : "Next"}
        pageLabel={locale === "tr" ? "Sayfa" : "Page"}
      />
    </AdminCenter>
  );
}
