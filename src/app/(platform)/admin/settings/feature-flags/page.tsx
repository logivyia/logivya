import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerLocale } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:manage");
  const locale = await getServerLocale();
  const isTr = locale === "tr";
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });

  return (
    <AdminCenter
      eyebrow={isTr ? "Kontrollü Yayınlar" : "Controlled Rollouts"}
      title={isTr ? "Özellik Bayrakları" : "Feature Flags"}
      description={isTr ? "Eksik veya riskli modülleri güvenli rollout yüzdesiyle yönetin." : "Manage incomplete or risky modules with a safe rollout percentage."}
      metrics={{
        [isTr ? "Toplam flag" : "Total flags"]: flags.length,
        [isTr ? "Aktif" : "Enabled"]: flags.filter((x) => x.isEnabled).length,
        [isTr ? "Kapalı" : "Disabled"]: flags.filter((x) => !x.isEnabled).length,
        [isTr ? "Tam rollout" : "Full rollout"]: flags.filter((x) => x.rolloutPercentage === 100).length,
      }}
    >
      <AdminTable
        headers={["Key", isTr ? "Ad" : "Name", isTr ? "Durum" : "Status", "Rollout", isTr ? "Açıklama" : "Description"]}
        rows={flags.map((x) => [x.key, x.name, x.isEnabled ? (isTr ? "Aktif" : "Enabled") : isTr ? "Kapalı" : "Disabled", `${x.rolloutPercentage}%`, x.description])}
      />
    </AdminCenter>
  );
}
