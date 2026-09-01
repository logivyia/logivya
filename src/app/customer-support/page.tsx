import Link from "next/link";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";

import { getServerTranslator } from "@/i18n/server";

export default async function Page() {
  const { t } = await getServerTranslator();

  return (
    <main className="min-h-screen bg-[#f8fafc] px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Logivya
        </Link>

        <header className="border-b border-slate-200 pb-8 pt-10">
          <p className="text-sm font-semibold text-primary">Logivya</p>
          <h1 className="mt-2 text-4xl font-semibold">
            {t("publicSupport.title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            {t("publicSupport.intro")}
          </p>
        </header>

        <div className="grid gap-8 py-10 md:grid-cols-2">
          <section className="space-y-3">
            <Mail aria-hidden="true" className="size-6 text-primary" />
            <h2 className="text-xl font-semibold">
              {t("publicSupport.emailTitle")}
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              {t("publicSupport.emailBody")}
            </p>
            <a
              href="mailto:support@logivya.com"
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
            >
              support@logivya.com
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">
              {t("publicSupport.inAppTitle")}
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              {t("publicSupport.inAppBody")}
            </p>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center font-semibold text-primary"
            >
              {t("publicSupport.loginAction")}
            </Link>
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-8">
            <h2 className="text-xl font-semibold">
              {t("publicSupport.responseTitle")}
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              {t("publicSupport.responseBody")}
            </p>
          </section>

          <section className="space-y-3 border-t border-slate-200 pt-8">
            <h2 className="text-xl font-semibold">
              {t("publicSupport.safetyTitle")}
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              {t("publicSupport.safetyBody")}
            </p>
          </section>
        </div>

        <nav
          aria-label={t("publicSupport.resourcesLabel")}
          className="flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-200 py-8 text-sm font-semibold"
        >
          <Link href="/privacy-policy" className="text-primary">
            {t("publicSupport.privacyAction")}
          </Link>
          <Link href="/account-deletion" className="text-primary">
            {t("publicSupport.deletionAction")}
          </Link>
          <Link href="/terms-of-service" className="text-primary">
            {t("publicSupport.termsAction")}
          </Link>
        </nav>
      </div>
    </main>
  );
}
