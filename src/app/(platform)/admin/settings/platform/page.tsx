import { AdminCenter } from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("admin.settings.read");
  const { t } = await getServerTranslator();

  return (
    <AdminCenter
      eyebrow={t("adminPlatform.eyebrow")}
      title={t("adminPlatform.title")}
      description={t("adminPlatform.description")}
      metricLinks={{
        [t("adminPlatform.maintenance")]: "/admin/system/health",
        [t("adminPlatform.emailProvider")]: "/admin/notifications",
        [t("adminPlatform.backupProvider")]: "/admin/system/backups",
        [t("adminPlatform.initialAdmin")]: "/admin/users",
      }}
      metrics={{
        [t("adminPlatform.maintenance")]: process.env.MAINTENANCE_MODE === "true" ? t("adminFeatureFlags.enabled") : t("adminFeatureFlags.disabled"),
        [t("adminPlatform.emailProvider")]: process.env.EMAIL_PROVIDER || t("adminPlatform.notConfigured"),
        [t("adminPlatform.backupProvider")]: process.env.BACKUP_STORAGE_PROVIDER || t("adminPlatform.notConfigured"),
        [t("adminPlatform.initialAdmin")]: process.env.INITIAL_PLATFORM_ADMIN_EMAIL ? t("adminPlatform.configured") : t("adminPlatform.notConfigured"),
      }}
    />
  );
}
