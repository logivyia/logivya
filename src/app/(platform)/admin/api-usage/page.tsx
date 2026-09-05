import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
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
  await requirePlatformAdmin("admin.apiUsage.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [keys, abuse, total] = await Promise.all([
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.apiUsageLog.count({ where: { abuseScore: { gt: 0 } } }),
    prisma.apiUsageLog.count(),
  ]);
  const pages = adminPageCount(total);
  const page = Math.min(requestedPage, pages);
  const logs = await prisma.apiUsageLog.findMany({
    include: { company: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });
  return (
    <AdminCenter
      eyebrow={t("adminApi.eyebrow")}
      title={t("adminApi.title")}
      description={t("adminApi.description")}
      metrics={{
        [t("adminApi.activeKeys")]: keys,
        [t("adminApi.shownRequests")]: `${logs.length} / ${total}`,
        [t("adminApi.abuseSignals")]: abuse,
      }}
    >
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("common.company"),
          t("adminApi.method"),
          t("adminApi.path"),
          t("common.status"),
          t("adminApi.latency"),
          t("adminApi.abuse"),
        ]}
        rows={logs.map((log) => [
          log.company.name,
          log.method,
          log.path,
          log.statusCode,
          `${log.latencyMs} ms`,
          log.abuseScore,
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
