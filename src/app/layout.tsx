import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/provider";
import { localeMetadata } from "@/i18n/config";
import { getServerLocale, loadServerDictionary } from "@/i18n/server";
import "./globals.css";
import { CookieConsent } from "@/components/cookie-consent";
import { WebObservability } from "@/components/web-observability";
import { PRODUCT_CONTENT } from "@/config/product-content";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.logivya.com"),
  title: {
    default: "Logivya | Canlı Lojistik Pazarı ve Akıllı Eşleştirme Platformu",
    template: "%s | Logivya",
  },
  applicationName: "Logivya",
  description: PRODUCT_CONTENT.tr.description,
  manifest: "/manifest.webmanifest?v=4",
  icons: {
    icon: [
      { url: "/favicon.ico?v=5", sizes: "any" },
      { url: "/favicon-16x16.png?v=5", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png?v=5", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico?v=5",
    apple: [{ url: "/apple-touch-icon.png?v=5", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Logivya",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: PRODUCT_CONTENT.tr.headline,
    description: PRODUCT_CONTENT.tr.description,
    siteName: "Logivya",
    locale: "tr_TR",
    type: "website",
    images: [{ url: "/logivya/og-image-v3.png", width: 1200, height: 630, alt: "Logivya" }],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_CONTENT.tr.headline,
    description: PRODUCT_CONTENT.tr.description,
    images: ["/logivya/og-image-v3.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  const dictionary = await loadServerDictionary(locale);
  return (
    <html lang={locale} dir={localeMetadata[locale].direction} suppressHydrationWarning>
      <body>
        <ThemeProvider><I18nProvider initialLocale={locale} initialDictionary={dictionary}>{children}<CookieConsent/><WebObservability/></I18nProvider></ThemeProvider>
      </body>
    </html>
  );
}
