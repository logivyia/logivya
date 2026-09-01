import { LegalPage } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return (
    <LegalPage title={t("legal.terms.title")} versionLabel={t("legal.version")}>
      <p>{t("legal.terms.usage")}</p>
      <p>{t("legal.terms.marketplace")}</p>
      <p>{t("legal.terms.prohibited")}</p>
      <p>{t("legal.terms.moderation")}</p>
      <p>{t("legal.terms.reporting")}</p>
      <p>{t("legal.terms.enforcement")}</p>
    </LegalPage>
  );
}
