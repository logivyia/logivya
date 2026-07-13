import { AdminCenter } from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("operations:read");
  const { t } = await getServerTranslator();
  return <AdminCenter eyebrow={t("adminRecovery.eyebrow")} title={t("adminRecovery.title")} description={t("adminRecovery.description")} metrics={{ [t("adminRecovery.rpo")]: t("adminRecovery.hours24"), [t("adminRecovery.rto")]: t("adminRecovery.hours4"), [t("adminRecovery.dailyRetention")]: t("adminRecovery.days7"), [t("adminRecovery.monthlyRetention")]: t("adminRecovery.months12") }}><div className="rounded-2xl border bg-white p-6 text-sm leading-7 text-slate-600">{t("adminRecovery.runbookDescription")} <code>docs/backup-and-disaster-recovery.md</code>.</div></AdminCenter>;
}
