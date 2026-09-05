import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { translations } from "../apps/mobile/src/i18n/translations";
import { locales } from "../src/i18n/config";
import { profileInformationSchema } from "../src/server/company/profile-information-schema";

const expected = {
  tr: {
    title: "Profil Bilgileri",
    description: "Profil ve iletişim bilgilerinizi yönetin.",
    name: "Ad Soyad",
  },
  en: {
    title: "Profile Information",
    description: "Manage your profile and contact information.",
    name: "Full Name",
  },
} as const;

const neutralLabels = {
  tr: {
    name: "Ad Soyad",
    payment: "Kart ödeme profili",
    workspaces: "Çalışma alanları",
  },
  en: {
    name: "Full Name",
    payment: "Card payment profile",
    workspaces: "Workspaces",
  },
  ar: {
    name: "الاسم الكامل",
    payment: "الملف الشخصي للدفع بالبطاقة",
    workspaces: "مساحات العمل",
  },
  ro: {
    name: "Nume complet",
    payment: "Profil de plată cu cardul",
    workspaces: "Spații de lucru",
  },
  ru: {
    name: "Полное имя",
    payment: "Профиль оплаты картой",
    workspaces: "Рабочие пространства",
  },
  az: {
    name: "Ad Soyad",
    payment: "Kart ödəniş profili",
    workspaces: "İş sahələri",
  },
  tk: {
    name: "Doly ady",
    payment: "Kart töleg profili",
    workspaces: "Iş ýerleri",
  },
  de: {
    name: "Vollständiger Name",
    payment: "Kartenzahlungsprofil",
    workspaces: "Arbeitsbereiche",
  },
  bg: {
    name: "Име и фамилия",
    payment: "Профил за плащане с карта",
    workspaces: "Работни пространства",
  },
  el: {
    name: "Ονοματεπώνυμο",
    payment: "Προφίλ πληρωμής με κάρτα",
    workspaces: "Χώροι εργασίας",
  },
  sr: {
    name: "Ime i prezime",
    payment: "Profil za plaćanje karticom",
    workspaces: "Radni prostori",
  },
} as const;

async function main() {
  const root = process.cwd();

  for (const locale of locales) {
    const web = JSON.parse(
      await readFile(
        path.join(root, "packages", "locales", `${locale}.json`),
        "utf8",
      ),
    ) as Record<string, string>;
    const mobile = translations[locale];

    assert.ok(
      web["settings.company"],
      `${locale}: web profile title is missing`,
    );
    assert.ok(
      web["company.description"],
      `${locale}: web profile description is missing`,
    );
    assert.ok(
      web["company.companyName"],
      `${locale}: web profile name label is missing`,
    );
    assert.equal(
      mobile.companySettings,
      web["settings.company"],
      `${locale}: web/mobile profile titles differ`,
    );
    assert.equal(
      mobile.companySettingsDescription,
      web["company.description"],
      `${locale}: web/mobile profile descriptions differ`,
    );
    assert.equal(
      mobile.companyName,
      web["company.companyName"],
      `${locale}: web/mobile name labels differ`,
    );
    assert.equal(
      web["registration.defaultCompanyName"],
      "{name}",
      `${locale}: registration must not append a company/business suffix`,
    );
    const neutral = neutralLabels[locale];
    for (const key of [
      "billing.companyName",
      "billing.legalName",
      "billing.tradeName",
    ] as const) {
      assert.equal(
        web[key],
        neutral.name,
        `${locale}:${key} must ask only for the person's name`,
      );
    }
    for (const key of ["company.billingType", "company.companyType"] as const) {
      assert.equal(
        web[key],
        neutral.payment,
        `${locale}:${key} must describe a personal card-payment profile`,
      );
    }
    assert.equal(
      web["adminCompanies.title"],
      neutral.workspaces,
      `${locale}: admin title must use workspace language`,
    );
  }

  for (const locale of ["tr", "en"] as const) {
    const web = JSON.parse(
      await readFile(
        path.join(root, "packages", "locales", `${locale}.json`),
        "utf8",
      ),
    ) as Record<string, string>;
    assert.equal(web["settings.company"], expected[locale].title);
    assert.equal(web["company.description"], expected[locale].description);
    assert.equal(web["company.companyName"], expected[locale].name);
  }

  assert.equal(translations.tr.companyUsers, "Kullanıcılar");
  assert.equal(translations.en.companyUsers, "Users");
  assert.equal(
    translations.tr.userProfileSubtitle,
    "Profil, ekip ve güvenlik ayarlarınızı yönetin.",
  );
  assert.equal(
    translations.en.userProfileSubtitle,
    "Manage your profile, team, and security settings.",
  );

  const minimal = profileInformationSchema.safeParse({
    companyName: "Burak Idim",
  });
  assert.equal(
    minimal.success,
    true,
    "A profile with only the required name must be accepted",
  );

  const legacyCorporateFields = profileInformationSchema.safeParse({
    companyName: "Burak İdim",
    phone: "",
    address: "",
    taxOffice: "",
    taxNumber: "",
    city: "",
    district: "",
    country: "",
    postalCode: "",
  });
  assert.equal(
    legacyCorporateFields.success,
    true,
    "Legacy clients must not break when they send obsolete fields",
  );
  if (legacyCorporateFields.success) {
    assert.deepEqual(legacyCorporateFields.data, {
      companyName: "Burak İdim",
      phone: undefined,
    });
  }
  assert.equal(
    profileInformationSchema.safeParse({ companyName: "A" }).success,
    false,
  );
  assert.equal(
    profileInformationSchema.safeParse({
      companyName: "Valid Name",
      phone: "invalid",
    }).success,
    false,
  );

  const webPage = await readFile(
    path.join(root, "src/components/company-settings-page.tsx"),
    "utf8",
  );
  assert.match(webPage, /\["companyName", "company\.companyName", true\]/);
  assert.match(webPage, /required \? " \*" : ""/);
  assert.match(webPage, /\["phone", "company\.phone", false\]/);
  for (const field of [
    "address",
    "taxOffice",
    "taxNumber",
    "city",
    "district",
    "country",
    "postalCode",
    "billingType",
  ]) {
    assert.doesNotMatch(
      webPage,
      new RegExp(`company\\.${field}`),
      `${field} must not be part of profile setup`,
    );
  }
  assert.match(webPage, /name === "email"/);

  const route = await readFile(
    path.join(root, "src/app/api/settings/company/route.ts"),
    "utf8",
  );
  assert.match(route, /profileInformationSchema\.safeParse/);
  assert.match(route, /name: value\.companyName/);
  assert.doesNotMatch(route, /companyBillingProfile/);
  assert.doesNotMatch(route, /billingType/);

  const mobileRoute = await readFile(
    path.join(root, "src/app/api/mobile/company/profile/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(mobileRoute, /Şirket bilgileri/);
  assert.match(mobileRoute, /Profil bilgileri alınamadı\./);
  assert.doesNotMatch(mobileRoute, /companyBillingProfile/);
  assert.doesNotMatch(mobileRoute, /billingType/);

  const mobileProfile = await readFile(
    path.join(root, "apps/mobile/src/screens/app/company-settings-screen.tsx"),
    "utf8",
  );
  for (const field of [
    "address",
    "taxOffice",
    "taxNumber",
    "city",
    "district",
    "country",
    "postalCode",
    "billingType",
  ]) {
    assert.doesNotMatch(
      mobileProfile,
      new RegExp(`key: "${field}"`),
      `${field} must not be part of mobile profile setup`,
    );
  }

  const shell = await readFile(
    path.join(root, "src/components/app-shell.tsx"),
    "utf8",
  );
  assert.match(
    shell,
    /\{\s*href:\s*"\/settings\/company",\s*key:\s*"settings\.company",\s*icon:\s*ContactRound/,
  );
  const supportNavigationIndex = shell.search(
    /\{\s*href:\s*"\/support",\s*key:\s*"nav\.support"/,
  );
  const subscriptionNavigationIndex = shell.search(
    /\{\s*href:\s*"\/settings\/subscriptions",\s*key:\s*"settings\.billing"/,
  );
  assert.ok(
    supportNavigationIndex >= 0,
    "Support navigation entry is required",
  );
  assert.ok(
    subscriptionNavigationIndex > supportNavigationIndex,
    "Subscription navigation must follow support in the primary navigation",
  );
  assert.equal(
    shell.match(
      /\{\s*href:\s*"\/settings\/subscriptions",\s*key:\s*"settings\.billing"/g,
    )?.length,
    1,
  );

  const mobileDrawer = await readFile(
    path.join(root, "apps/mobile/src/components/web-parity-tab-bar.tsx"),
    "utf8",
  );
  assert.match(
    mobileDrawer,
    /key: "CompanySettings"[\s\S]*?icon: "person-circle-outline"/,
  );
  const mobileSupportIndex = mobileDrawer.search(
    /\{\s*name:\s*"Support",\s*labelKey:\s*"support"/,
  );
  const mobileSubscriptionIndex = mobileDrawer.search(
    /\{\s*key:\s*"Subscription",\s*label:\s*t\("subscription"\)/,
  );
  assert.ok(mobileSupportIndex >= 0, "Mobile support navigation is required");
  assert.ok(
    mobileSubscriptionIndex > mobileSupportIndex,
    "Mobile subscription navigation must follow support",
  );
  assert.doesNotMatch(mobileDrawer, /key: "SubscriptionSettings"/);

  const mobileAdmin = await readFile(
    path.join(root, "apps/mobile/src/api/mobileAdmin.ts"),
    "utf8",
  );
  assert.match(mobileAdmin, /title: "Calisma Alanlari"/);
  assert.doesNotMatch(mobileAdmin, /title: "Sirketler"|Platform sirketleri/i);

  const supportEmail = await readFile(
    path.join(root, "src/lib/email/templates/support-ticket.ts"),
    "utf8",
  );
  assert.match(
    supportEmail,
    /\["Account", value\(variables, "companyName"\)\]/,
  );
  assert.doesNotMatch(
    supportEmail,
    /\["Company", value\(variables, "companyName"\)\]/,
  );

  const webRegistration = await readFile(
    path.join(root, "src/app/api/auth/register/route.ts"),
    "utf8",
  );
  const mobileRegistration = await readFile(
    path.join(root, "src/app/api/mobile/auth/register/route.ts"),
    "utf8",
  );
  assert.match(webRegistration, /const defaultWorkspaceName = fullName/);
  assert.match(
    webRegistration,
    /data: \{ name: defaultWorkspaceName, ownerId: user\.id/,
  );
  assert.match(
    mobileRegistration,
    /data:\s*\{\s*name:\s*user\.name\.trim\(\),\s*ownerId:\s*user\.id/,
  );
  assert.doesNotMatch(webRegistration, /defaultCompanyName/);
  assert.doesNotMatch(mobileRegistration, /defaultCompanyName/);
  assert.doesNotMatch(webRegistration, /companyBillingProfile/);
  assert.doesNotMatch(mobileRegistration, /companyBillingProfile/);

  const trWeb = JSON.parse(
    await readFile(path.join(root, "packages/locales/tr.json"), "utf8"),
  ) as Record<string, string>;
  const enWeb = JSON.parse(
    await readFile(path.join(root, "packages/locales/en.json"), "utf8"),
  ) as Record<string, string>;
  for (const key of [
    "settings.company",
    "company.companyName",
    "registration.newCompany",
    "adminCompanies.title",
    "billing.companyName",
    "billing.legalName",
    "billing.tradeName",
    "company.billingType",
    "company.companyType",
  ]) {
    assert.doesNotMatch(
      trWeb[key] ?? "",
      /şirket|firma|işletme/iu,
      `tr:${key} must use neutral account/workspace language`,
    );
    assert.doesNotMatch(
      enWeb[key] ?? "",
      /company|business|organi[sz]ation/iu,
      `en:${key} must use neutral account/workspace language`,
    );
  }

  console.log(
    `Profile information and neutral workspace contracts passed for ${locales.length} active locales.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
