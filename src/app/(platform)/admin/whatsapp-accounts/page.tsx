import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerLocale } from "@/i18n/server";
import { getWhatsAppStatusLabel } from "@/lib/i18n/status-labels";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:read");
  const locale = await getServerLocale();
  const isTr = locale === "tr";
  const rows = await prisma.whatsAppAccount.findMany({
    include: { company: { select: { name: true } }, _count: { select: { groups: true, recipients: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminCenter
      eyebrow={isTr ? "Mesajlaşma Altyapısı" : "Messaging Infrastructure"}
      title={isTr ? "WhatsApp Hesapları" : "WhatsApp Accounts"}
      description={isTr ? "Platform genelindeki WhatsApp bağlantı ve senkronizasyon sağlığı." : "WhatsApp connection and synchronization health across the platform."}
      metrics={{
        [isTr ? "Gösterilen" : "Shown"]: rows.length,
        [isTr ? "Bağlı" : "Connected"]: rows.filter((x) => x.status === "CONNECTED").length,
        [isTr ? "Bağlantısız" : "Not connected"]: rows.filter((x) => x.status === "DISCONNECTED").length,
        [isTr ? "Riskli" : "At risk"]: rows.filter((x) => ["ERROR", "FAILED", "RECONNECT_REQUIRED"].includes(x.status)).length,
      }}
    >
      <AdminTable
        headers={[isTr ? "Hesap" : "Account", isTr ? "Şirket" : "Company", isTr ? "Durum" : "Status", isTr ? "Gruplar" : "Groups", isTr ? "Gönderimler" : "Deliveries", isTr ? "Son eşitleme" : "Last sync"]}
        rows={rows.map((x) => [
          x.label,
          x.company.name,
          getWhatsAppStatusLabel(x.status, locale),
          x._count.groups,
          x._count.recipients,
          x.lastSyncedAt?.toLocaleString(isTr ? "tr-TR" : "en-US"),
        ])}
      />
    </AdminCenter>
  );
}
