import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/provider";
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
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/logivya/favicon-v2.ico", sizes: "any" },
      { url: "/logivya/favicon-16x16-v2.png", type: "image/png", sizes: "16x16" },
      { url: "/logivya/favicon-32x32-v2.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/logivya/favicon-v2.ico",
    apple: [{ url: "/logivya/apple-touch-icon-v2.png", type: "image/png", sizes: "180x180" }],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        <ThemeProvider><I18nProvider>{children}<CookieConsent/></I18nProvider></ThemeProvider>
      </body>
    </html>
  );
}
