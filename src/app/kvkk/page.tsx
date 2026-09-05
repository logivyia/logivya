import { LegalPage, LegalSections } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return <LegalPage title={t("legal.kvkk.title")} versionLabel={t("legal.version")}>
    <p>{t("legal.kvkk.intro")}</p>
    <LegalSections sections={[
      { title: t("legal.kvkk.controllerTitle"), paragraphs: [t("legal.kvkk.controllerBody")] },
      { title: t("legal.kvkk.dataTitle"), paragraphs: [t("legal.kvkk.dataBody")] },
      { title: t("legal.kvkk.purposeTitle"), paragraphs: [t("legal.kvkk.processing"), t("legal.kvkk.purposeBody")] },
      { title: t("legal.kvkk.transferTitle"), paragraphs: [t("legal.kvkk.transferBody")] },
      { title: t("legal.kvkk.methodTitle"), paragraphs: [t("legal.kvkk.methodBody")] },
      { title: t("legal.kvkk.rightsTitle"), paragraphs: [t("legal.kvkk.rights"), t("legal.kvkk.applicationBody")] },
      { title: t("legal.kvkk.contactTitle"), paragraphs: [t("legal.kvkk.contactBody")] },
    ]} />
  </LegalPage>;
}
