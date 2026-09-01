import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicAttributionLink } from "@/components/public-attribution-link";
import { PublicHeader } from "@/components/public-header";
import { PublicPricingCards } from "@/components/public-pricing-cards";
import { productContent } from "@/config/product-content";
import { PUBLIC_PRODUCT_PAGE_MAP, PUBLIC_PRODUCT_PAGES } from "@/config/public-product-pages";
import { getServerTranslator } from "@/i18n/server";
import { resolveProductFeature } from "@/server/features/product-status";

const SITE_URL = "https://www.logivya.com";

export function generateStaticParams() {
  return PUBLIC_PRODUCT_PAGES.map((page) => ({ publicSlug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ publicSlug: string }> }): Promise<Metadata> {
  const { publicSlug } = await params;
  const page = PUBLIC_PRODUCT_PAGE_MAP.get(publicSlug);
  if (!page) return {};
  const feature = page.feature ? await resolveProductFeature(page.feature) : null;
  const unavailable = feature?.status === "INTERNAL" || feature?.status === "DISABLED";
  return {
    title: page.title,
    description: page.description,
    alternates: {
      canonical: `/${page.slug}`,
      languages: { tr: `/${page.slug}`, "x-default": `/${page.slug}` },
    },
    robots: unavailable ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `${page.title} | Logivya`,
      description: page.description,
      url: `${SITE_URL}/${page.slug}`,
      siteName: "Logivya",
      locale: "tr_TR",
      type: "website",
      images: [{ url: "/logivya/og-image-v3.png", width: 1200, height: 630, alt: page.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} | Logivya`,
      description: page.description,
      images: ["/logivya/og-image-v3.png"],
    },
  };
}

export default async function PublicProductPage({ params }: { params: Promise<{ publicSlug: string }> }) {
  const { publicSlug } = await params;
  const page = PUBLIC_PRODUCT_PAGE_MAP.get(publicSlug);
  if (!page) notFound();
  const { locale, t } = await getServerTranslator();
  const productCopy = productContent(locale);
  const feature = page.feature ? await resolveProductFeature(page.feature) : null;
  const unavailable = feature?.status === "INTERNAL" || feature?.status === "DISABLED";
  if (unavailable) notFound();
  const statusLabel = feature?.status === "BETA"
    ? t("publicProduct.status.beta")
    : feature?.status === "COMING_SOON"
      ? t("publicProduct.status.comingSoon")
      : unavailable
        ? t("publicProduct.status.notPublic")
        : feature
          ? t("publicProduct.status.public")
          : t("announcement.type.info");
  const structuredData = publicStructuredData(page, unavailable);

  return <main className="min-h-screen bg-[#090d19] text-white">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(structuredData) }} />
    <PublicHeader />

    <article className="mx-auto max-w-5xl px-5 pb-24 pt-16">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,.18),transparent_42%),rgba(255,255,255,.035)] p-7 sm:p-12">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-black tracking-[.22em] text-orange-300">{page.eyebrow}</p>
          {statusLabel ? <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-3 py-1 text-[11px] font-bold text-orange-200">{statusLabel}</span> : null}
        </div>
        <h1 className="mt-6 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">{page.title}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/65">{page.description}</p>
      </div>

      {page.slug === "fiyatlandirma" ? <PublicPricingCards embedded showHeading={false} /> : null}

      {unavailable ? <section className="mt-10 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-6">
        <h2 className="text-xl font-bold">{t("publicProduct.unavailable.title")}</h2>
        <p className="mt-3 leading-7 text-white/70">{t("publicProduct.unavailable.description")}</p>
      </section> : null}

      <section className="mt-12 grid gap-10 md:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-5 text-base leading-8 text-white/70">
          {page.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-6">
          <h2 className="text-lg font-bold">{t("publicProduct.highlights")}</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-white/65">
            {page.bullets.map((bullet) => <li key={bullet} className="flex gap-3"><span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-orange-400" />{bullet}</li>)}
          </ul>
        </div>
      </section>

      <section className="mt-12 grid gap-5 md:grid-cols-2">
        <InfoSection title={t("publicProduct.audience")} items={[page.audience]} />
        <InfoSection title={t("publicProduct.howItWorks")} items={page.howItWorks} />
        <InfoSection title={t("publicProduct.useCases")} items={page.useCases} />
        <InfoSection title={t("publicProduct.limitations")} items={page.limitations} />
      </section>

      {!unavailable ? <section className="mt-14 rounded-3xl border border-white/10 bg-white/[.04] p-8 text-center">
        <h2 className="text-2xl font-black">{productCopy.slogan}</h2>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-white/70">{productCopy.shortDefinition}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3"><PublicAttributionLink destination="/register" className="inline-flex min-h-11 items-center rounded-xl bg-orange-500 px-6 py-3 font-bold">{productCopy.primaryCta}</PublicAttributionLink><Link href="/canli-lojistik-pazari" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-6 py-3 font-bold">{productCopy.liveCta}</Link></div>
      </section> : null}
    </article>

    <footer className="border-t border-white/10 px-5 py-9 text-center text-sm text-white/70">
      <div className="flex flex-wrap justify-center gap-5"><Link href="/logivya-nedir">{t("publicProduct.footer.whatIs")}</Link><Link href="/hakkimizda">{t("publicProduct.footer.about")}</Link><Link href="/sss">{t("publicProduct.footer.faq")}</Link><Link href="/privacy-policy">{t("home.link.privacy")}</Link><Link href="/terms-of-service">{t("home.link.terms")}</Link></div>
    </footer>
  </main>;
}

function InfoSection({ title, items }: { title: string; items: readonly string[] }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[.025] p-6">
    <h2 className="text-xl font-bold">{title}</h2>
    <ul className="mt-4 space-y-3 text-sm leading-7 text-white/65">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  </section>;
}

function publicStructuredData(page: (typeof PUBLIC_PRODUCT_PAGES)[number], unavailable: boolean) {
  const graph: Array<Record<string, unknown>> = [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Logivya", url: SITE_URL, logo: `${SITE_URL}/android-chrome-512x512.png?v=3` },
    { "@type": "WebPage", "@id": `${SITE_URL}/${page.slug}#webpage`, url: `${SITE_URL}/${page.slug}`, name: page.title, description: page.description, isPartOf: { "@id": `${SITE_URL}/#website` } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Logivya", item: SITE_URL }, { "@type": "ListItem", position: 2, name: page.title, item: `${SITE_URL}/${page.slug}` }] },
  ];
  if (!unavailable) graph.push({ "@type": "SoftwareApplication", name: "Logivya", applicationCategory: "BusinessApplication", operatingSystem: "Web, Android, iOS", description: page.description, offers: { "@type": "Offer", price: "0", priceCurrency: "TRY", description: "7 gün ücretsiz deneme" } });
  if (page.slug === "sss") graph.push({ "@type": "FAQPage", mainEntity: page.bullets.map((question, index) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: page.paragraphs[index % page.paragraphs.length] } })) });
  return { "@context": "https://schema.org", "@graph": graph };
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}
