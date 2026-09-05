import Link from "next/link";

import { LegalPage, LegalSections } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();
  return (
    <LegalPage title={t("legal.delivery.title")} versionLabel={t("legal.version")}>
      <p>{t("legal.delivery.intro")}</p>
      <p>{t("legal.delivery.storeScope")}</p>
      <LegalSections sections={[
        { title: t("legal.delivery.deliveryTitle"), paragraphs: [t("legal.delivery.deliveryBody"), t("legal.delivery.deliveryAccess")] },
        { title: t("legal.delivery.cancellationTitle"), paragraphs: [t("legal.delivery.cancellationBody")] },
        { title: t("legal.delivery.withdrawalTitle"), paragraphs: [t("legal.delivery.withdrawalBody"), t("legal.delivery.withdrawalConsent")] },
        {
          title: t("legal.delivery.refundTitle"),
          paragraphs: [t("legal.delivery.refundIntro")],
          items: [
            t("legal.delivery.refundItem.activation"),
            t("legal.delivery.refundItem.duplicate"),
            t("legal.delivery.refundItem.nonDelivery"),
            t("legal.delivery.refundItem.mandatory"),
          ],
        },
        { title: t("legal.delivery.requestTitle"), paragraphs: [t("legal.delivery.requestBody"), t("legal.delivery.reviewBody"), t("legal.delivery.processingBody")] },
        { title: t("legal.delivery.chargebackTitle"), paragraphs: [t("legal.delivery.chargebackBody")] },
      ]} />
      <nav aria-labelledby="related-documents-heading" className="border-t border-slate-200 pt-5">
        <h2 id="related-documents-heading" className="text-xl font-semibold text-slate-950">{t("legal.delivery.linksTitle")}</h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 font-semibold text-primary">
          <Link href="/terms-of-service">{t("legal.terms.title")}</Link>
          <Link href="/distance-service-agreement">{t("legal.distance.title")}</Link>
          <Link href="/customer-support">{t("publicSupport.title")}</Link>
        </div>
      </nav>
    </LegalPage>
  );
}
