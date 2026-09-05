import { LegalPage, LegalSections } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return (
    <LegalPage title={t("legal.terms.title")} versionLabel={t("legal.version")}>
      <p>{t("legal.terms.intro")}</p>
      <LegalSections sections={[
        { title: t("legal.terms.eligibilityTitle"), paragraphs: [t("legal.terms.eligibilityBody")] },
        { title: t("legal.terms.accountTitle"), paragraphs: [t("legal.terms.accountBody")] },
        { title: t("legal.terms.messagingTitle"), paragraphs: [t("legal.terms.usage"), t("legal.terms.messagingBody")] },
        { title: t("legal.terms.marketplaceTitle"), paragraphs: [t("legal.terms.marketplace")] },
        { title: t("legal.terms.prohibitedTitle"), paragraphs: [t("legal.terms.prohibited")] },
        { title: t("legal.terms.paymentsTitle"), paragraphs: [t("legal.terms.paymentsBody")] },
        { title: t("legal.terms.providersTitle"), paragraphs: [t("legal.terms.providersBody")] },
        { title: t("legal.terms.ipTitle"), paragraphs: [t("legal.terms.ipBody")] },
        { title: t("legal.terms.moderationTitle"), paragraphs: [t("legal.terms.moderation"), t("legal.terms.reporting"), t("legal.terms.enforcement")] },
        { title: t("legal.terms.availabilityTitle"), paragraphs: [t("legal.terms.availabilityBody")] },
        { title: t("legal.terms.liabilityTitle"), paragraphs: [t("legal.terms.liabilityBody")] },
        { title: t("legal.terms.consumerTitle"), paragraphs: [t("legal.terms.consumerBody")] },
        { title: t("legal.terms.terminationTitle"), paragraphs: [t("legal.terms.terminationBody")] },
        { title: t("legal.terms.governingTitle"), paragraphs: [t("legal.terms.governingBody")] },
        { title: t("legal.terms.contactTitle"), paragraphs: [t("legal.terms.contactBody")] },
      ]} />
    </LegalPage>
  );
}
