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
  await requirePlatformAdmin("admin.settings.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [endpointCount, activeCount, failed, dead] = await Promise.all([
    prisma.webhookEndpoint.count(),
    prisma.webhookEndpoint.count({ where: { isActive: true } }),
    prisma.webhookDelivery.count({ where: { status: "FAILED" } }),
    prisma.webhookDelivery.count({ where: { status: "DEAD_LETTER" } }),
  ]);
  const pages = adminPageCount(endpointCount);
  const page = Math.min(requestedPage, pages);
  const endpoints = await prisma.webhookEndpoint.findMany({
    include: {
      company: { select: { name: true } },
      deliveries: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });
  return (
    <AdminCenter
      eyebrow={t("adminWebhooks.eyebrow")}
      title={t("adminWebhooks.title")}
      description={t("adminWebhooks.description")}
      metrics={{
        [t("adminWebhooks.endpoints")]: endpointCount,
        [t("status.active")]: activeCount,
        [t("status.failed")]: failed,
        [t("adminWebhooks.deadLetter")]: dead,
      }}
    >
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("common.company"),
          "URL",
          t("status.active"),
          t("adminWebhooks.events"),
          t("adminWebhooks.lastDelivery"),
        ]}
        rows={endpoints.map((endpoint) => [
          endpoint.company.name,
          safeUrlOrigin(endpoint.url),
          endpoint.isActive ? t("common.yes") : t("common.no"),
          endpoint.events.length,
          endpoint.deliveries[0]?.status
            ? t(`webhook.status.${endpoint.deliveries[0].status.toLowerCase()}`)
            : "-",
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

function safeUrlOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "-";
  }
}
