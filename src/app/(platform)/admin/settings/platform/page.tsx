import { AdminCenter } from "@/components/admin-center";
import { getServerLocale } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("operations:manage");
  const locale = await getServerLocale();
  const isTr = locale === "tr";
  const enabled = isTr ? "Aktif" : "Enabled";
  const disabled = isTr ? "Kapalı" : "Disabled";
  const configured = isTr ? "Yapılandırıldı" : "Configured";
  const notConfigured = isTr ? "Yapılandırılmadı" : "Not configured";

  return (
    <AdminCenter
      eyebrow={isTr ? "Platform Yönetişimi" : "Platform Governance"}
      title={isTr ? "Platform Ayarları" : "Platform Settings"}
      description={isTr ? "Bakım modu, yönetici bootstrap ve operasyon sağlayıcılarının güvenli görünümü." : "A safe view of maintenance mode, admin bootstrap, and operational providers."}
      metrics={{
        [isTr ? "Bakım modu" : "Maintenance"]: process.env.MAINTENANCE_MODE === "true" ? enabled : disabled,
        [isTr ? "E-posta sağlayıcısı" : "Email provider"]: process.env.EMAIL_PROVIDER || notConfigured,
        [isTr ? "Yedek sağlayıcısı" : "Backup provider"]: process.env.BACKUP_STORAGE_PROVIDER || notConfigured,
        [isTr ? "İlk yönetici" : "Initial admin"]: process.env.INITIAL_PLATFORM_ADMIN_EMAIL ? configured : notConfigured,
      }}
    />
  );
}
