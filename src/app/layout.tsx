import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/provider";
import { getServerLocale, loadServerDictionary } from "@/i18n/server";
import "./globals.css";
import { CookieConsent } from "@/components/cookie-consent";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.logivya.com"),
  title: {
    default: "Logivya",
    template: "%s | Logivya",
  },
  applicationName: "Logivya",
  description: "Multi-tenant WhatsApp communication and campaign operations.",
  manifest: "/manifest.webmanifest?v=3",
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", sizes: "any" },
      { url: "/favicon-16x16.png?v=3", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png?v=3", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico?v=3",
    apple: [{ url: "/apple-touch-icon.png?v=3", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Logivya",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Logivya",
    description: "Multi-tenant WhatsApp communication and campaign operations.",
    siteName: "Logivya",
    type: "website",
    images: [{ url: "/logivya/og-image-v2.png", width: 1200, height: 630, alt: "Logivya" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Logivya",
    description: "Multi-tenant WhatsApp communication and campaign operations.",
    images: ["/logivya/og-image-v2.png"],
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
    <html lang={locale} suppressHydrationWarning>
      <body>
        <ThemeProvider><I18nProvider initialLocale={locale} initialDictionary={dictionary}>{children}<CookieConsent/></I18nProvider></ThemeProvider>
      </body>
    </html>
  );
}
