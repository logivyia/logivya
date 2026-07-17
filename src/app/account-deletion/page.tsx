import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";
import { getServerTranslator } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Logivya account deletion",
  description: "Request deletion of a Logivya account and its associated data."
};

export default async function Page() {
  const { t } = await getServerTranslator();
  const emailSubject = encodeURIComponent("Logivya account deletion request");

  return (
    <LegalPage title={t("legal.deletion.title")} versionLabel={t("legal.version")}>
      <p>{t("legal.deletion.intro")}</p>

      <h2 className="text-xl font-semibold">{t("legal.deletion.inAppTitle")}</h2>
      <p>{t("legal.deletion.inAppBody")}</p>
      <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline" href="/login?next=/settings/delete-account">
        {t("legal.deletion.inAppAction")}
      </Link>

      <h2 className="text-xl font-semibold">{t("legal.deletion.webTitle")}</h2>
      <p>{t("legal.deletion.webBody")}</p>
      <a className="inline-flex min-h-11 items-center font-semibold text-primary underline" href={`mailto:support@logivya.com?subject=${emailSubject}`}>
        support@logivya.com
      </a>

      <h2 className="text-xl font-semibold">{t("legal.deletion.scopeTitle")}</h2>
      <p>{t("legal.deletion.scopeBody")}</p>

      <h2 className="text-xl font-semibold">{t("legal.deletion.retentionTitle")}</h2>
      <p>{t("legal.deletion.retentionBody")}</p>

      <h2 className="text-xl font-semibold">{t("legal.deletion.impactTitle")}</h2>
      <p>{t("legal.deletion.impactBody")}</p>

      <h2 className="text-xl font-semibold">{t("legal.deletion.timelineTitle")}</h2>
      <p>{t("legal.deletion.timelineBody")}</p>
    </LegalPage>
  );
}
