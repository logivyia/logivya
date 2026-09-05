import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { getAdminCampaignPrivacySnapshot } from "@/server/admin/message-privacy";
import {
  ADMIN_TABLE_PAGE_SIZE,
  normalizeAdminPage,
} from "@/server/admin/pagination";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePlatformAdmin("admin.campaignMetrics.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  let snapshot = await getAdminCampaignPrivacySnapshot({
    page: requestedPage,
    limit: ADMIN_TABLE_PAGE_SIZE,
  });
  const page = Math.min(requestedPage, snapshot.pagination.pages);
  if (page !== requestedPage) {
    snapshot = await getAdminCampaignPrivacySnapshot({
      page,
      limit: ADMIN_TABLE_PAGE_SIZE,
    });
  }

  return (
    <AdminCenter
      eyebrow={t("adminCampaigns.eyebrow")}
      title={t("adminCampaigns.title")}
      description={t("adminCampaigns.description")}
      metrics={{
        [t("adminCampaigns.shown")]: snapshot.metrics.totalOperations,
        [t("adminCampaigns.failed")]: snapshot.metrics.failedOperations,
        [t("adminCampaigns.sending")]: snapshot.metrics.processingOperations,
        [t("adminCampaigns.completed")]: snapshot.metrics.successfulOperations,
      }}
    >
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {t("adminCampaigns.description")}
      </div>
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          locale === "tr" ? "İşlem referansı" : "Operation reference",
          t("common.status"),
          locale === "tr" ? "Toplam" : "Total",
          t("adminCampaigns.sentFailed"),
          t("admin.list.date"),
        ]}
        rows={snapshot.operations.map((operation) => [
          operation.operationReference,
          t(`status.${operation.status.toLowerCase()}`),
          operation.total,
          `${operation.succeeded} / ${operation.failed}`,
          operation.dateBucket,
        ])}
      />
      <AdminPagination
        page={page}
        pages={snapshot.pagination.pages}
        previousLabel={locale === "tr" ? "Önceki" : "Previous"}
        nextLabel={locale === "tr" ? "Sonraki" : "Next"}
        pageLabel={locale === "tr" ? "Sayfa" : "Page"}
      />
    </AdminCenter>
  );
}
