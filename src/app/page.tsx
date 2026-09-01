import type { Metadata } from "next";
import { HomePageClient } from "@/components/home-page-client";
import { getSessionContext } from "@/server/auth/session";
import { resolveAllProductFeatures } from "@/server/features/product-status";

const homeDescription = "Yük, araç ve şoför ilanlarını yayınlayın; evden eve nakliyat, parsiyel yük ve ağır nakliyat fırsatlarını keşfedin, uygun talepleri akıllı eşleştirmeyle bulun.";

export const metadata: Metadata = {
  title: { absolute: "Logivya | Canlı Lojistik Pazarı ve Akıllı Eşleştirme Platformu" },
  description: homeDescription,
  alternates: { canonical: "/", languages: { tr: "/", "x-default": "/" } },
  openGraph: {
    title: "Lojistiği Logivya ile Yönet",
    description: homeDescription,
    url: "/",
    type: "website",
    images: [{ url: "/logivya/og-image-v3.png", width: 1200, height: 630, alt: "Logivya canlı lojistik pazarı" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lojistiği Logivya ile Yönet",
    description: homeDescription,
    images: ["/logivya/og-image-v3.png"],
  },
};

export default async function Home() {
  const session = await getSessionContext();
  if (session) return <meta httpEquiv="refresh" content="0;url=/dashboard" />;
  const features = await resolveAllProductFeatures();
  return <HomePageClient featureStatuses={Object.fromEntries(Object.values(features).map((feature) => [feature.key, feature.status]))} />;
}
