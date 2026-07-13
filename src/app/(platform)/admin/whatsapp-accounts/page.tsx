import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:read");
  const { locale, t } = await getServerTranslator();
  const rows = await prisma.whatsAppAccount.findMany({
    include: { company: { select: { name: true } }, _count: { select: { groups: true, recipients: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminCenter
      eyebrow={t("adminWhatsApp.eyebrow")}
      title={t("adminWhatsApp.title")}
      description={t("adminWhatsApp.description")}
      metrics={{
        [t("adminWhatsApp.shown")]: rows.length,
        [t("adminWhatsApp.connected")]: rows.filter((x) => x.status === "CONNECTED").length,
        [t("adminWhatsApp.disconnected")]: rows.filter((x) => x.status === "DISCONNECTED").length,
        [t("adminWhatsApp.atRisk")]: rows.filter((x) => ["ERROR", "FAILED", "RECONNECT_REQUIRED"].includes(x.status)).length,
      }}
    >
      <AdminTable
        headers={[t("common.account"), t("common.company"), t("common.status"), t("common.groups"), t("adminWhatsApp.deliveries"), t("accounts.lastSync")]}
        rows={rows.map((x) => [
          x.label,
          x.company.name,
          t(`accountStatus.${x.status}`),
          x._count.groups,
          x._count.recipients,
          x.lastSyncedAt ? formatDateTime(x.lastSyncedAt, locale) : "-",
        ])}
      />
    </AdminCenter>
  );
}
