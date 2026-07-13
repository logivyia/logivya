import { LegalPage } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return <LegalPage title={t("legal.cookies.title")} versionLabel={t("legal.version")}><p>{t("legal.cookies.body")}</p></LegalPage>;
}
