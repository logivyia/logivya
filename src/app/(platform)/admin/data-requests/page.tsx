import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("data_requests:manage");
  const { locale, t } = await getServerTranslator();
  const rows = await prisma.dataSubjectRequest.findMany({ include: { company: { select: { name: true } }, user: { select: { email: true } } }, orderBy: { requestedAt: "desc" }, take: 100 });
  return <AdminCenter eyebrow={t("adminData.eyebrow")} title={t("adminData.title")} description={t("adminData.description")} metrics={{ [t("adminData.total")]: rows.length, [t("adminData.pending")]: rows.filter((row) => ["REQUESTED", "VERIFYING", "PROCESSING"].includes(row.status)).length, [t("adminData.completed")]: rows.filter((row) => row.status === "COMPLETED").length, [t("adminData.deletion")]: rows.filter((row) => row.type === "DELETION").length }}><AdminTable emptyLabel={t("admin.list.empty")} headers={[t("adminNotifications.type"), t("common.status"), t("common.company"), t("users.user"), t("adminData.requestDate")]} rows={rows.map((row) => [t(`dataRequest.type.${row.type.toLowerCase()}`), t(`dataRequest.status.${row.status.toLowerCase()}`), row.company?.name, row.user?.email, formatDateTime(row.requestedAt, locale)])}/></AdminCenter>;
}
