import { LegalPage } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return <LegalPage title={t("legal.privacy.title")} versionLabel={t("legal.version")}><p>{t("legal.privacy.intro")}</p><h2 className="text-xl font-semibold">{t("legal.privacy.securityTitle")}</h2><p>{t("legal.privacy.securityBody")}</p></LegalPage>;
}
