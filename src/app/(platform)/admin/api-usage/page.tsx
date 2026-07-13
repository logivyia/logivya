import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:read");
  const { t } = await getServerTranslator();
  const [logs, keys, abuse] = await Promise.all([prisma.apiUsageLog.findMany({ include: { company: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }), prisma.apiKey.count({ where: { revokedAt: null } }), prisma.apiUsageLog.count({ where: { abuseScore: { gt: 0 } } })]);
  return <AdminCenter eyebrow={t("adminApi.eyebrow")} title={t("adminApi.title")} description={t("adminApi.description")} metrics={{ [t("adminApi.activeKeys")]: keys, [t("adminApi.shownRequests")]: logs.length, [t("adminApi.abuseSignals")]: abuse, [t("adminApi.secretExposure")]: 0 }}><AdminTable emptyLabel={t("admin.list.empty")} headers={[t("common.company"), t("adminApi.method"), t("adminApi.path"), t("common.status"), t("adminApi.latency"), t("adminApi.abuse")]} rows={logs.map((log) => [log.company.name, log.method, log.path, log.statusCode, `${log.latencyMs} ms`, log.abuseScore])}/></AdminCenter>;
}
