import { LegalPage } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return <LegalPage title={t("legal.dpa.title")} versionLabel={t("legal.version")}><p>{t("legal.dpa.body")}</p></LegalPage>;
}
