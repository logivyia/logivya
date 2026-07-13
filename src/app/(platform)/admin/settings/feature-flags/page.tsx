import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:manage");
  const { t } = await getServerTranslator();
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });

  return (
    <AdminCenter
      eyebrow={t("adminFeatureFlags.eyebrow")}
      title={t("adminFeatureFlags.title")}
      description={t("adminFeatureFlags.description")}
      metrics={{
        [t("adminFeatureFlags.total")]: flags.length,
        [t("adminFeatureFlags.enabled")]: flags.filter((x) => x.isEnabled).length,
        [t("adminFeatureFlags.disabled")]: flags.filter((x) => !x.isEnabled).length,
        [t("adminFeatureFlags.fullRollout")]: flags.filter((x) => x.rolloutPercentage === 100).length,
      }}
    >
      <AdminTable
        headers={[t("adminFeatureFlags.key"), t("adminFeatureFlags.name"), t("common.status"), t("adminFeatureFlags.rollout"), t("adminFeatureFlags.flagDescription")]}
        rows={flags.map((x) => [x.key, x.name, x.isEnabled ? t("adminFeatureFlags.enabled") : t("adminFeatureFlags.disabled"), `${x.rolloutPercentage}%`, x.description])}
      />
    </AdminCenter>
  );
}
