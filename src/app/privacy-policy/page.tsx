import { LegalPage } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  const sections = [
    ["legal.privacy.controllerTitle", "legal.privacy.controllerBody"],
    ["legal.privacy.dataTitle", "legal.privacy.dataBody"],
    ["legal.privacy.customerDataTitle", "legal.privacy.customerDataBody"],
    ["legal.privacy.purposesTitle", "legal.privacy.purposesBody"],
    ["legal.privacy.sourcesTitle", "legal.privacy.sourcesBody"],
    ["legal.privacy.sharingTitle", "legal.privacy.sharingBody"],
    ["legal.privacy.transfersTitle", "legal.privacy.transfersBody"],
    ["legal.privacy.retentionTitle", "legal.privacy.retentionBody"],
    ["legal.privacy.securityTitle", "legal.privacy.securityBody"],
    ["legal.privacy.choicesTitle", "legal.privacy.choicesBody"],
    ["legal.privacy.rightsTitle", "legal.privacy.rightsBody"],
    ["legal.privacy.childrenTitle", "legal.privacy.childrenBody"],
    ["legal.privacy.changesTitle", "legal.privacy.changesBody"],
    ["legal.privacy.contactTitle", "legal.privacy.contactBody"],
  ] as const;

  return (
    <LegalPage
      title={t("legal.privacy.title")}
      versionLabel={t("legal.privacy.version")}
    >
      <p>{t("legal.privacy.intro")}</p>
      {sections.map(([titleKey, bodyKey]) => (
        <section key={titleKey} className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-950">
            {t(titleKey)}
          </h2>
          <p>{t(bodyKey)}</p>
        </section>
      ))}
    </LegalPage>
  );
}
