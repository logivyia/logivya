import { LegalPage, LegalSections } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return <LegalPage title={t("legal.cookies.title")} versionLabel={t("legal.version")}>
    <p>{t("legal.cookies.intro")}</p>
    <LegalSections sections={[
      { title: t("legal.cookies.essentialTitle"), paragraphs: [t("legal.cookies.body")] },
      { title: t("legal.cookies.preferenceTitle"), paragraphs: [t("legal.cookies.preferenceBody")] },
      { title: t("legal.cookies.analyticsTitle"), paragraphs: [t("legal.cookies.analyticsBody")] },
      { title: t("legal.cookies.listTitle"), paragraphs: [t("legal.cookies.listBody")] },
      { title: t("legal.cookies.retentionTitle"), paragraphs: [t("legal.cookies.retentionBody")] },
      { title: t("legal.cookies.controlTitle"), paragraphs: [t("legal.cookies.controlBody")] },
      { title: t("legal.cookies.changesTitle"), paragraphs: [t("legal.cookies.changesBody")] },
    ]} />
  </LegalPage>;
}
