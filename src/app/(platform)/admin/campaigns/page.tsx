import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { getAdminCampaignPrivacySnapshot } from "@/server/admin/message-privacy";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("admin.campaignMetrics.read");
  const { t } = await getServerTranslator();
  const snapshot = await getAdminCampaignPrivacySnapshot({ page: 1, limit: 100 });

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
        headers={["Islem referansi", t("common.status"), "Toplam", t("adminCampaigns.sentFailed"), t("admin.list.date")]}
        rows={snapshot.operations.map((operation) => [
          operation.operationReference,
          t(`status.${operation.status.toLowerCase()}`),
          operation.total,
          `${operation.succeeded} / ${operation.failed}`,
          operation.dateBucket,
        ])}
      />
    </AdminCenter>
  );
}
