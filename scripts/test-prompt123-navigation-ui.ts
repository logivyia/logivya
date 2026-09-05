import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFile(path.join(root, relativePath), "utf8");

async function main() {
  const [
    mobileNav,
    webNav,
    webWhatsApp,
    whatsApp,
    attachmentSheet,
    navigationTypes,
    mobileTranslations,
    webTranslations,
    lowbed,
  ] = await Promise.all([
    read("apps/mobile/src/components/web-parity-tab-bar.tsx"),
    read("src/components/app-shell.tsx"),
    read("src/components/accounts-stable-page.tsx"),
    read("apps/mobile/src/screens/app/whatsapp-screen.tsx"),
    read("apps/mobile/src/components/message-attachment-picker.tsx"),
    read("apps/mobile/src/types/navigation.ts"),
    read("apps/mobile/src/i18n/translations.ts"),
    read("packages/locales/tr.json"),
    read("apps/mobile/src/components/lowbed-icon.tsx"),
  ]);

  const mobileLocaleCodes = ["az", "bg", "de", "el", "ro", "ru", "sr", "tk"];
  const mobileLocaleCatalogs = await Promise.all(
    mobileLocaleCodes.map(async (locale) => ({
      locale,
      catalog: JSON.parse(
        await read(`apps/mobile/src/i18n/locales/${locale}.json`),
      ) as Record<string, string>,
    })),
  );
  const webLocaleCodes = [
    "az",
    "bg",
    "de",
    "el",
    "en",
    "ro",
    "ru",
    "sr",
    "tk",
    "tr",
  ];
  const webLocaleCatalogs = await Promise.all(
    webLocaleCodes.map(async (locale) => ({
      locale,
      catalog: JSON.parse(
        await read(`packages/locales/${locale}.json`),
      ) as Record<string, string>,
    })),
  );

  const mobilePrimaryNav = mobileNav.slice(
    mobileNav.indexOf("function baseMainNav"),
    mobileNav.indexOf("function mainNav"),
  );
  assert(
    !mobilePrimaryNav.includes('name: "Messaging"'),
    "Standalone message send must not remain in mobile primary navigation.",
  );
  assert(
    !mobilePrimaryNav.includes('name: "MessageHistory"'),
    "Standalone message history must not remain in mobile primary navigation.",
  );

  const webPrimaryNav = webNav.slice(
    webNav.indexOf("const primaryNav ="),
    webNav.indexOf("const settingsNav"),
  );
  assert(
    !webPrimaryNav.includes('"/send-message"'),
    "Standalone message send must not remain in web primary navigation.",
  );
  assert(
    !webPrimaryNav.includes('"/message-history"'),
    "Standalone message history must not remain in web primary navigation.",
  );
  for (const marker of [
    'key: "nav.dashboard"',
    'key: "nav.accounts"',
    'key: "nav.telegramManagement"',
    'key: "nav.facebookManagement"',
    'key: "nav.homeMoving"',
    'key: "nav.partialLoad"',
    'key: "nav.heavyHaul"',
    'key: "nav.groups"',
    'key: "nav.categories"',
    'key: "nav.support"',
    'key: "settings.billing"',
  ])
    assert(
      webPrimaryNav.includes(marker),
      `Required web navigation entry missing: ${marker}`,
    );
  assert(
    webNav.includes("LowbedIcon"),
    "Heavy-haul web navigation must use the low-bed icon.",
  );

  for (const route of [
    'href: "/accounts"',
    'href: "/groups?platform=WHATSAPP"',
    'href: "/send-message?platform=WHATSAPP"',
    'href: "/message-history?platform=WHATSAPP"',
  ])
    assert(
      webWhatsApp.includes(route),
      `WhatsApp web workspace shortcut missing: ${route}`,
    );
  assert(
    webWhatsApp.includes('t("accounts.workspaceTab")'),
    "WhatsApp web workspace must label the current tab as Accounts.",
  );

  for (const route of [
    'navigate("Groups", { initialPlatform: "WHATSAPP" })',
    'navigate("Messaging", { initialPlatform: "WHATSAPP" })',
    'navigate("MessageHistory", { initialPlatform: "WHATSAPP" })',
  ])
    assert(
      whatsApp.includes(route),
      `WhatsApp workspace shortcut missing: ${route}`,
    );

  assert(
    navigationTypes.includes('initialPlatform?: "WHATSAPP" | "TELEGRAM"'),
    "Contextual workspace routes must carry a platform hint.",
  );
  assert(
    mobileNav.includes("function DrawerSettings"),
    "Mobile settings drawer must use a collapsible parent.",
  );
  assert(
    mobileNav.includes("function SidebarSettings"),
    "Permanent sidebar settings must use the same collapsible pattern.",
  );
  assert(
    mobileNav.includes("accessibilityState={{ expanded"),
    "Settings parents must expose their expanded state.",
  );

  for (const marker of [
    "useSafeAreaInsets",
    "accessibilityViewIsModal",
    "onAccessibilityEscape",
    "paddingBottom: Math.max(insets.bottom",
    "<ScrollView",
  ]) {
    assert(
      attachmentSheet.includes(marker),
      `Attachment sheet accessibility/safe-area marker missing: ${marker}`,
    );
  }
  assert(
    attachmentSheet.includes("minHeight: 52"),
    "Attachment sheet rows must retain a large touch target.",
  );

  assert(
    lowbed.includes("export function LowbedIcon"),
    "Reusable low-bed icon is missing.",
  );
  assert(
    lowbed.includes("project-haul-icon-transparent.png"),
    "Low-bed icon must use the owner-supplied transparent project-haul artwork.",
  );
  assert(
    mobileNav.includes('icon: "lowbed"'),
    "Heavy-haul navigation must use the low-bed icon.",
  );

  for (const label of [
    "WhatsApp Yönetimi",
    "Telegram Yönetimi",
    "Facebook Yönetimi",
  ]) {
    assert(
      mobileTranslations.includes(label),
      `Mobile workspace label missing: ${label}`,
    );
  }
  assert(
    webTranslations.includes('"nav.accounts": "WhatsApp Yönetimi"'),
    "Web WhatsApp workspace label is missing.",
  );

  for (const { locale, catalog } of mobileLocaleCatalogs) {
    for (const key of [
      "whatsappAccounts",
      "telegramAccounts",
      "facebookPages",
      "accountsTab",
      "historyTab",
    ]) {
      assert(
        catalog[key]?.trim(),
        `${locale} mobile workspace label missing: ${key}`,
      );
    }
  }
  for (const { locale, catalog } of webLocaleCatalogs) {
    for (const key of [
      "nav.accounts",
      "accounts.workspaceTab",
      "settings.profile",
      "settings.profileName",
      "settings.profileEmail",
      "settings.profileRole",
    ]) {
      assert(
        catalog[key]?.trim(),
        `${locale} web navigation/profile label missing: ${key}`,
      );
    }
  }

  console.log("Prompt 1-3 navigation and attachment UI contracts passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
