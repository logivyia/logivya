import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerLocale } from "@/i18n/server";
import { getMessageStatusLabel } from "@/lib/i18n/status-labels";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:read");
  const locale = await getServerLocale();
  const isTr = locale === "tr";
  const rows = await prisma.messageCampaign.findMany({
    include: { company: { select: { name: true } }, createdBy: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminCenter
      eyebrow={isTr ? "Mesaj Operasyonları" : "Message Operations"}
      title={isTr ? "Kampanyalar" : "Campaigns"}
      description={isTr ? "Platform genelindeki kampanya sağlığını ve başarısızlıkları izleyin." : "Monitor campaign health and failures across the platform."}
      metrics={{
        [isTr ? "Gösterilen" : "Shown"]: rows.length,
        [isTr ? "Başarısız" : "Failed"]: rows.filter((x) => x.status === "FAILED").length,
        [isTr ? "Gönderiliyor" : "Sending"]: rows.filter((x) => x.status === "SENDING").length,
        [isTr ? "Tamamlanan" : "Completed"]: rows.filter((x) => x.status === "COMPLETED").length,
      }}
    >
      <AdminTable
        headers={[isTr ? "Kampanya" : "Campaign", isTr ? "Şirket" : "Company", isTr ? "Durum" : "Status", isTr ? "Gönderilen / Başarısız" : "Sent / Failed", isTr ? "Aktör" : "Actor", isTr ? "Tarih" : "Date"]}
        rows={rows.map((x) => [
          x.title,
          x.company.name,
          getMessageStatusLabel(x.status, locale),
          `${x.sentCount} / ${x.failedCount}`,
          x.createdBy.email,
          x.createdAt.toLocaleString(isTr ? "tr-TR" : "en-US"),
        ])}
      />
    </AdminCenter>
  );
}
