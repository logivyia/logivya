import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin();
  const { t } = await getServerTranslator();
  const cards = ["adminBackups.lastDatabase", "adminBackups.lastFiles", "adminBackups.restoreReadiness"];
  return <><h1 className="text-3xl font-semibold">{t("adminBackups.title")}</h1><p className="mt-2 text-sm text-muted">{t("adminBackups.description")}</p><div className="mt-6 grid gap-4 md:grid-cols-3">{cards.map((key, index) => <div className="panel rounded-2xl p-5" key={key}><b>{t(key)}</b><p className="mt-3 text-sm text-muted">{index === 2 ? t("adminBackups.runbookReady") : process.env.BACKUP_STORAGE_PROVIDER ? t("adminBackups.providerConfigured") : t("adminBackups.awaitingProvider")}</p></div>)}</div></>;
}
