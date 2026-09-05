import { LegalPage, LegalSections } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return <LegalPage title={t("legal.dpa.title")} versionLabel={t("legal.version")}>
    <p>{t("legal.dpa.intro")}</p>
    <LegalSections sections={[
      { title: t("legal.dpa.scopeTitle"), paragraphs: [t("legal.dpa.scopeBody")] },
      { title: t("legal.dpa.rolesTitle"), paragraphs: [t("legal.dpa.body"), t("legal.dpa.rolesBody")] },
      { title: t("legal.dpa.instructionsTitle"), paragraphs: [t("legal.dpa.instructionsBody")] },
      { title: t("legal.dpa.confidentialityTitle"), paragraphs: [t("legal.dpa.confidentialityBody")] },
      { title: t("legal.dpa.securityTitle"), paragraphs: [t("legal.dpa.securityBody")] },
      { title: t("legal.dpa.subprocessorsTitle"), paragraphs: [t("legal.dpa.subprocessorsBody")] },
      { title: t("legal.dpa.transfersTitle"), paragraphs: [t("legal.dpa.transfersBody")] },
      { title: t("legal.dpa.assistanceTitle"), paragraphs: [t("legal.dpa.assistanceBody")] },
      { title: t("legal.dpa.incidentTitle"), paragraphs: [t("legal.dpa.incidentBody")] },
      { title: t("legal.dpa.returnTitle"), paragraphs: [t("legal.dpa.returnBody")] },
      { title: t("legal.dpa.auditTitle"), paragraphs: [t("legal.dpa.auditBody")] },
      { title: t("legal.dpa.orderTitle"), paragraphs: [t("legal.dpa.orderBody")] },
    ]} />
  </LegalPage>;
}
