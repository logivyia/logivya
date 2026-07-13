import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:read");
  const { locale, t } = await getServerTranslator();
  const rows = await prisma.messageCampaign.findMany({
    include: { company: { select: { name: true } }, createdBy: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminCenter
      eyebrow={t("adminCampaigns.eyebrow")}
      title={t("adminCampaigns.title")}
      description={t("adminCampaigns.description")}
      metrics={{
        [t("adminCampaigns.shown")]: rows.length,
        [t("adminCampaigns.failed")]: rows.filter((x) => x.status === "FAILED").length,
        [t("adminCampaigns.sending")]: rows.filter((x) => x.status === "SENDING").length,
        [t("adminCampaigns.completed")]: rows.filter((x) => x.status === "COMPLETED").length,
      }}
    >
      <AdminTable
        headers={[t("adminCampaigns.campaign"), t("common.company"), t("common.status"), t("adminCampaigns.sentFailed"), t("adminCampaigns.actor"), t("admin.list.date")]}
        rows={rows.map((x) => [
          x.title,
          x.company.name,
          t(`status.${x.status.toLowerCase()}`),
          `${x.sentCount} / ${x.failedCount}`,
          x.createdBy.email,
          formatDateTime(x.createdAt, locale),
        ])}
      />
    </AdminCenter>
  );
}
