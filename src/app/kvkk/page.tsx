import { LegalPage } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return <LegalPage title={t("legal.kvkk.title")} versionLabel={t("legal.version")}><p>{t("legal.kvkk.processing")}</p><p>{t("legal.kvkk.rights")}</p></LegalPage>;
}
