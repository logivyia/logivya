import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/provider";
import "./globals.css";
import { CookieConsent } from "@/components/cookie-consent";

export const metadata: Metadata = {
  title: "Logivya",
  description: "Multi-tenant WhatsApp communication and campaign operations.",
  icons: { icon: "/logivya/logivya.png", shortcut: "/logivya/logivya.png", apple: "/logivya/logivya.png" },
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
