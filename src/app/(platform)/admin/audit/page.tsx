import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("audit:read");
  const { locale, t } = await getServerTranslator();
  const [logs, access, sensitive] = await Promise.all([prisma.auditLog.findMany({ include: { company: { select: { name: true } }, user: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 150 }), prisma.adminAccessLog.count(), prisma.adminAccessLog.count({ where: { sensitive: true } })]);
  return <AdminCenter eyebrow={t("adminAudit.eyebrow")} title={t("adminAudit.title")} description={t("adminAudit.description")} metrics={{ [t("adminAudit.shownRecords")]: logs.length, [t("adminAudit.adminAccess")]: access, [t("adminAudit.sensitiveAccess")]: sensitive, [t("adminAudit.deletableRecords")]: 0 }}><AdminTable emptyLabel={t("admin.list.empty")} headers={[t("adminAudit.action"), t("adminAudit.entity"), t("common.company"), t("adminCampaigns.actor"), t("admin.list.date")]} rows={logs.map((log) => [t(`audit.action.${log.action}`), `${t(`entity.${log.entityType.toLowerCase()}`)} ${log.entityId || ""}`, log.company.name, log.user?.email, formatDateTime(log.createdAt, locale)])}/></AdminCenter>;
}
