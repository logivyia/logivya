export const SUBSCRIPTION_PLAN_CODES = ["trial", "starter", "professional"] as const;
export const PURCHASABLE_SUBSCRIPTION_PLAN_CODES = ["starter", "professional"] as const;
export const SUBSCRIPTION_PRICING_CONFIGURATION_VERSION = "2026-07-28-v1";

export type SubscriptionPlanCode = (typeof SUBSCRIPTION_PLAN_CODES)[number];
export type PurchasableSubscriptionPlanCode = (typeof PURCHASABLE_SUBSCRIPTION_PLAN_CODES)[number];
export type SubscriptionBillingInterval = "MONTHLY" | "YEARLY";
export type CanonicalSubscriptionPlanCode =
  | "LOGIVYA_TRIAL_7D"
  | "LOGIVYA_PLUS"
  | "LOGIVYA_PRO";
export type SubscriptionMarketingFeatureCode =
  | "ACCOUNT_ALLOWANCE"
  | "BRANDED_MESSAGING"
  | "UNBRANDED_MESSAGING"
  | "CONTACT_MESSAGING"
  | "GROUP_MESSAGING"
  | "SCHEDULED_RECURRING"
  | "DELETE_FOR_EVERYONE"
  | "ADVANCED_SUPPORT"
  | "TRIAL_DURATION";

export type SubscriptionMarketingLocale = "tr" | "en";
export type SubscriptionMarketingSummaryGroup = Readonly<{
  title: string;
  description: string;
}>;
export type SubscriptionLocalizedCopy<T> = Readonly<Record<SubscriptionMarketingLocale, T>>;

export type CanonicalSubscriptionPlan = {
  canonicalCode: CanonicalSubscriptionPlanCode;
  code: Uppercase<SubscriptionPlanCode>;
  slug: SubscriptionPlanCode;
  displayNameKey: `home.plan.${SubscriptionPlanCode}.name`;
  descriptionKey: `home.plan.${SubscriptionPlanCode}.description`;
  badgeKey: `home.plan.${SubscriptionPlanCode}.badge`;
  ctaKey: `home.plan.${SubscriptionPlanCode}.cta`;
  currency: "TRY";
  monthlyPriceMinor: number;
  yearlyPriceMinor: number;
  yearlyMonthlyEquivalentMinor: number;
  trialDurationDays: number;
  accountLimit: number;
  whatsappConnectionLimit: number;
  marketingDescription: SubscriptionLocalizedCopy<string>;
  marketingSummaryGroups: SubscriptionLocalizedCopy<readonly SubscriptionMarketingSummaryGroup[]>;
  seatClarification: SubscriptionLocalizedCopy<string>;
  marketingFeatures: Readonly<{ tr: readonly string[]; en: readonly string[] }>;
  technicalCapabilities: {
    marketplaceBrowse: boolean;
    listingCreate: boolean;
    listingManage: boolean;
    demandCreate: boolean;
    smartMatching: boolean;
    homeMovingAccess: boolean;
    partialLoadAccess: boolean;
    heavyHaulAccess: boolean;
    whatsappAccountConnect: boolean;
    whatsappGroupSend: boolean;
    whatsappContactSend: boolean;
    telegramAccountConnect: boolean;
    telegramGroupSend: boolean;
    facebookPageConnect: boolean;
    facebookPagePublish: boolean;
  };
  signatureBehavior: "BRANDED" | "UNBRANDED";
  publicVisibility: true;
  effectiveVersion: typeof SUBSCRIPTION_PRICING_CONFIGURATION_VERSION;
  features: {
    contactMessaging: boolean;
    groupMessaging: boolean;
    scheduledMessaging: boolean;
    recurringMessaging: boolean;
    deleteForEveryone: boolean;
    messageHistory: boolean;
    categories: boolean;
    advancedSupport: boolean;
    brandingFooter: boolean;
    advertisingEnabled: boolean;
  };
  featureCodes: readonly SubscriptionMarketingFeatureCode[];
  billingIntervals: readonly SubscriptionBillingInterval[];
  active: true;
  sortOrder: number;
};

export const CANONICAL_SUBSCRIPTION_PLANS: Record<SubscriptionPlanCode, CanonicalSubscriptionPlan> = {
  trial: {
    canonicalCode: "LOGIVYA_TRIAL_7D",
    code: "TRIAL",
    slug: "trial",
    displayNameKey: "home.plan.trial.name",
    descriptionKey: "home.plan.trial.description",
    badgeKey: "home.plan.trial.badge",
    ctaKey: "home.plan.trial.cta",
    currency: "TRY",
    monthlyPriceMinor: 0,
    yearlyPriceMinor: 0,
    yearlyMonthlyEquivalentMinor: 0,
    trialDurationDays: 7,
    accountLimit: 1,
    whatsappConnectionLimit: 1,
    marketingDescription: {
      tr: "Logivya’nın canlı lojistik, ilan, eşleştirme ve iletişim özelliklerini 7 gün boyunca ücretsiz deneyin.",
      en: "Try Logivya’s live logistics, listing, matching, and communication features free for 7 days.",
    },
    marketingSummaryGroups: {
      tr: [
        { title: "Canlı Lojistik Pazarı", description: "Yük, araç ve şoför ilanlarını görüntüleyin." },
        { title: "Yük, Araç ve Şoför İşlemleri", description: "Yük Bul, Yük Paylaş, Araç Bul, Araç Paylaş, Şoför Bul ve Şoför İlanı Ver özelliklerini deneyin." },
        { title: "Genel ve Sektörel Lojistik Alanları", description: "Genel Lojistik, Evden Eve Nakliyat, Parsiyel Yük ve Ağır Nakliyat bölümlerine erişin." },
        { title: "İlan ve Talep Yönetimi", description: "İlan oluşturun, ilan bulun ve uygun yük, araç veya şoför için talep oluşturun." },
        { title: "Akıllı Eşleştirme", description: "Talebinize uygun ilan bulunduğunda eşleşmeleri görüntüleyin." },
        { title: "WhatsApp ve Telegram Yönetimi", description: "WhatsApp grup ve kişi yönetimi ile Telegram grup yönetimini deneyin." },
        { title: "Mesajlaşma Araçları", description: "Kişilere ve gruplara mesaj gönderin, zamanlama ve geçmiş özelliklerini kullanın." },
      ],
      en: [
        { title: "Live Logistics Marketplace", description: "View load, vehicle, and driver listings." },
        { title: "Load, Vehicle, and Driver Tools", description: "Try finding and sharing loads and vehicles, finding drivers, and publishing driver listings." },
        { title: "General and Specialized Logistics", description: "Access General Logistics, Home Moving, Partial Load, and Heavy Haul sections." },
        { title: "Listing and Demand Management", description: "Create and find listings, and save a demand for a suitable load, vehicle, or driver." },
        { title: "Intelligent Matching", description: "View matches when a listing relevant to your demand is available." },
        { title: "WhatsApp and Telegram Management", description: "Try WhatsApp group and contact management together with Telegram group management." },
        { title: "Messaging Tools", description: "Message contacts and groups and use scheduling and history tools." },
      ],
    },
    seatClarification: {
      tr: "Paket sahibi dahil toplam 1 kullanıcı hesabı.",
      en: "1 user account in total, including the plan owner.",
    },
    marketingFeatures: {
      tr: ["Canlı Lojistik Pazarına erişim", "Yük Bul ve Yük Paylaş", "Araç Bul ve Araç Paylaş", "Şoför Bul ve Şoför İlanı Ver", "Genel Lojistik", "Evden Eve Nakliyat", "Parsiyel Yük", "Ağır Nakliyat", "İlan oluşturma, bulma ve yönetme", "Talep oluşturma ve uygun eşleşmeleri bulma", "WhatsApp grup ve kişi yönetimi", "Telegram grup yönetimi", "Gruplar ve kategoriler", "Kişilere ve gruplara mesaj gönderimi", "İleri tarihli ve tekrarlı mesaj gönderimi", "Mesaj geçmişi"],
      en: ["Access to the Live Logistics Marketplace", "Find and share loads", "Find and share vehicles", "Find drivers and post driver listings", "General logistics", "Home moving", "Partial loads", "Heavy haulage", "Create, find, and manage listings", "Create demands and find relevant matches", "WhatsApp group and contact management", "Telegram group management", "Groups and categories", "Send messages to contacts and groups", "Scheduled and recurring messaging", "Message history"],
    },
    technicalCapabilities: fullLogisticsCapabilities(),
    signatureBehavior: "BRANDED",
    publicVisibility: true,
    effectiveVersion: SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
    features: {
      contactMessaging: true,
      groupMessaging: true,
      scheduledMessaging: true,
      recurringMessaging: true,
      deleteForEveryone: true,
      messageHistory: true,
      categories: true,
      advancedSupport: true,
      brandingFooter: true,
      advertisingEnabled: true,
    },
    featureCodes: ["ACCOUNT_ALLOWANCE", "BRANDED_MESSAGING", "CONTACT_MESSAGING", "GROUP_MESSAGING", "SCHEDULED_RECURRING", "DELETE_FOR_EVERYONE", "ADVANCED_SUPPORT", "TRIAL_DURATION"],
    billingIntervals: [],
    active: true,
    sortOrder: 10,
  },
  starter: {
    canonicalCode: "LOGIVYA_PLUS",
    code: "STARTER",
    slug: "starter",
    displayNameKey: "home.plan.starter.name",
    descriptionKey: "home.plan.starter.description",
    badgeKey: "home.plan.starter.badge",
    ctaKey: "home.plan.starter.cta",
    currency: "TRY",
    monthlyPriceMinor: 28_000,
    yearlyPriceMinor: 300_000,
    yearlyMonthlyEquivalentMinor: 25_000,
    trialDurationDays: 0,
    accountLimit: 2,
    whatsappConnectionLimit: 2,
    marketingDescription: {
      tr: "Canlı lojistik pazarını, ilan süreçlerini ve iletişim operasyonlarını ekip halinde yönetin.",
      en: "Manage the live logistics marketplace, listing workflows, and communication operations as a team.",
    },
    marketingSummaryGroups: {
      tr: [
        { title: "Canlı Lojistik Pazarı", description: "Güncel yük, araç ve şoför ilanlarını görüntüleyin ve yönetin." },
        { title: "Yük, Araç ve Şoför İşlemleri", description: "Yük Bul, Yük Paylaş, Araç Bul, Araç Paylaş, Şoför Bul ve Şoför İlanı Ver özelliklerini kullanın." },
        { title: "Genel ve Sektörel Lojistik Alanları", description: "Genel Lojistik, Evden Eve Nakliyat, Parsiyel Yük ve Ağır Nakliyat bölümlerine erişin." },
        { title: "İlan ve Akıllı Eşleştirme", description: "İlan oluşturun, bulun, düzenleyin ve taleplerinize uygun eşleşme bildirimleri alın." },
        { title: "WhatsApp ve Telegram Yönetimi", description: "WhatsApp grup ve kişi yönetimi ile Telegram grup yönetimini kullanın." },
        { title: "Kişi ve Grup Mesajlaşması", description: "Kişilere ve gruplara tek panel üzerinden mesaj gönderin." },
        { title: "Paket Avantajları", description: "2 ayrı kullanıcı erişimi, Logivya imzalı gönderim ve gelişmiş destek." },
      ],
      en: [
        { title: "Live Logistics Marketplace", description: "View and manage current load, vehicle, and driver listings." },
        { title: "Load, Vehicle, and Driver Tools", description: "Find and share loads and vehicles, find drivers, and publish driver listings." },
        { title: "General and Specialized Logistics", description: "Access General Logistics, Home Moving, Partial Load, and Heavy Haul sections." },
        { title: "Listings and Intelligent Matching", description: "Create, find, and edit listings and receive notifications for matches relevant to your demands." },
        { title: "WhatsApp and Telegram Management", description: "Use WhatsApp group and contact management together with Telegram group management." },
        { title: "Contact and Group Messaging", description: "Message contacts and groups from one workspace." },
        { title: "Plan Benefits", description: "2 separate user accounts, Logivya-branded messaging, and advanced support." },
      ],
    },
    seatClarification: {
      tr: "Paket sahibi dahil, her biri kendi giriş bilgileriyle erişen toplam 2 kullanıcı.",
      en: "2 users in total, including the plan owner, each with their own sign-in credentials.",
    },
    marketingFeatures: {
      tr: ["Canlı Lojistik Pazarına erişim", "Yük Bul ve Yük Paylaş", "Araç Bul ve Araç Paylaş", "Şoför Bul ve Şoför İlanı Ver", "Genel Lojistik", "Evden Eve Nakliyat", "Parsiyel Yük", "Ağır Nakliyat", "İlan oluşturma, bulma, düzenleme ve yönetme", "Talep oluşturma ve akıllı eşleşme bildirimleri", "WhatsApp grup ve kişi yönetimi", "Telegram grup yönetimi", "Kişilere ve gruplara mesaj gönderimi", "Logivya imzalı gönderim", "Gelişmiş destek"],
      en: ["Access to the Live Logistics Marketplace", "Find and share loads", "Find and share vehicles", "Find drivers and post driver listings", "General logistics", "Home moving", "Partial loads", "Heavy haulage", "Create, find, edit, and manage listings", "Create demands and receive intelligent match notifications", "WhatsApp group and contact management", "Telegram group management", "Send messages to contacts and groups", "Messages with the Logivya signature", "Advanced support"],
    },
    technicalCapabilities: fullLogisticsCapabilities(),
    signatureBehavior: "BRANDED",
    publicVisibility: true,
    effectiveVersion: SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
    features: {
      contactMessaging: true,
      groupMessaging: true,
      scheduledMessaging: true,
      recurringMessaging: true,
      deleteForEveryone: true,
      messageHistory: true,
      categories: true,
      advancedSupport: true,
      brandingFooter: true,
      advertisingEnabled: true,
    },
    featureCodes: ["ACCOUNT_ALLOWANCE", "BRANDED_MESSAGING", "CONTACT_MESSAGING", "GROUP_MESSAGING", "SCHEDULED_RECURRING", "DELETE_FOR_EVERYONE", "ADVANCED_SUPPORT"],
    billingIntervals: ["MONTHLY", "YEARLY"],
    active: true,
    sortOrder: 20,
  },
  professional: {
    canonicalCode: "LOGIVYA_PRO",
    code: "PROFESSIONAL",
    slug: "professional",
    displayNameKey: "home.plan.professional.name",
    descriptionKey: "home.plan.professional.description",
    badgeKey: "home.plan.professional.badge",
    ctaKey: "home.plan.professional.cta",
    currency: "TRY",
    monthlyPriceMinor: 38_000,
    yearlyPriceMinor: 420_000,
    yearlyMonthlyEquivalentMinor: 35_000,
    trialDurationDays: 0,
    accountLimit: 3,
    whatsappConnectionLimit: 3,
    marketingDescription: {
      tr: "Gelişmiş lojistik, akıllı eşleştirme ve mesajlaşma operasyonlarını ekip halinde yönetin.",
      en: "Manage advanced logistics, intelligent matching, and messaging operations as a team.",
    },
    marketingSummaryGroups: {
      tr: [
        { title: "Canlı Lojistik Pazarı", description: "Yük, araç ve şoför ilanlarını görüntüleyin, yayınlayın ve yönetin." },
        { title: "Yük, Araç ve Şoför İşlemleri", description: "Yük, araç ve şoför ilanlarına yönelik bütün temel yayınlama, arama ve yönetim akışlarını kullanın." },
        { title: "Genel ve Sektörel Lojistik Alanları", description: "Genel Lojistik, Evden Eve Nakliyat, Parsiyel Yük ve Ağır Nakliyat bölümlerine erişin." },
        { title: "Gelişmiş Akıllı Eşleştirme", description: "Oluşturduğunuz talepler için gelişmiş eşleşme ve bildirim özelliklerinden yararlanın." },
        { title: "WhatsApp ve Telegram Yönetimi", description: "WhatsApp grup ve kişi yönetimi ile Telegram grup yönetimini tek merkezden yürütün." },
        { title: "Grup, Kategori ve Mesaj Otomasyonu", description: "Grupları kategorilere ayırın, kişilere ve gruplara mesaj gönderin, zamanlanmış ve tekrarlı gönderimler oluşturun." },
        { title: "Geçmiş ve Paket Avantajları", description: "Mesaj geçmişini yönetin, 3 ayrı kullanıcı erişimi ve gelişmiş destek avantajlarından yararlanın." },
      ],
      en: [
        { title: "Live Logistics Marketplace", description: "View, publish, and manage load, vehicle, and driver listings." },
        { title: "Load, Vehicle, and Driver Tools", description: "Use the core publishing, search, and management workflows for load, vehicle, and driver listings." },
        { title: "General and Specialized Logistics", description: "Access General Logistics, Home Moving, Partial Load, and Heavy Haul sections." },
        { title: "Advanced Intelligent Matching", description: "Use advanced matching and notification features for your saved demands." },
        { title: "WhatsApp and Telegram Management", description: "Manage WhatsApp groups and contacts and Telegram groups from one place." },
        { title: "Group, Category, and Message Automation", description: "Organize groups into categories, message contacts and groups, and create scheduled and recurring sends." },
        { title: "History and Plan Benefits", description: "Manage message history and use 3 separate user accounts with advanced support." },
      ],
    },
    seatClarification: {
      tr: "Paket sahibi dahil, her biri kendi giriş bilgileriyle erişen toplam 3 kullanıcı.",
      en: "3 users in total, including the plan owner, each with their own sign-in credentials.",
    },
    marketingFeatures: {
      tr: ["Canlı Lojistik Pazarına erişim", "Yük Bul ve Yük Paylaş", "Araç Bul ve Araç Paylaş", "Şoför Bul ve Şoför İlanı Ver", "Genel Lojistik", "Evden Eve Nakliyat", "Parsiyel Yük", "Ağır Nakliyat", "İlan oluşturma, bulma, düzenleme ve yönetme", "Talep oluşturma ve gelişmiş akıllı eşleşme bildirimleri", "WhatsApp grup ve kişi yönetimi", "Telegram grup yönetimi", "Gruplar ve kategoriler", "Kişilere ve gruplara mesaj gönderimi", "İleri tarihli ve tekrarlı mesaj gönderimi", "Mesaj geçmişi", "Gelişmiş destek"],
      en: ["Access to the Live Logistics Marketplace", "Find and share loads", "Find and share vehicles", "Find drivers and post driver listings", "General logistics", "Home moving", "Partial loads", "Heavy haulage", "Create, find, edit, and manage listings", "Create demands and receive advanced intelligent match notifications", "WhatsApp group and contact management", "Telegram group management", "Groups and categories", "Send messages to contacts and groups", "Scheduled and recurring messaging", "Message history", "Advanced support"],
    },
    technicalCapabilities: fullLogisticsCapabilities(),
    signatureBehavior: "UNBRANDED",
    publicVisibility: true,
    effectiveVersion: SUBSCRIPTION_PRICING_CONFIGURATION_VERSION,
    features: {
      contactMessaging: true,
      groupMessaging: true,
      scheduledMessaging: true,
      recurringMessaging: true,
      deleteForEveryone: true,
      messageHistory: true,
      categories: true,
      advancedSupport: true,
      brandingFooter: false,
      advertisingEnabled: false,
    },
    featureCodes: ["ACCOUNT_ALLOWANCE", "UNBRANDED_MESSAGING", "CONTACT_MESSAGING", "GROUP_MESSAGING", "SCHEDULED_RECURRING", "DELETE_FOR_EVERYONE", "ADVANCED_SUPPORT"],
    billingIntervals: ["MONTHLY", "YEARLY"],
    active: true,
    sortOrder: 30,
  },
};

const PLAN_ALIASES: Record<string, SubscriptionPlanCode> = {
  logivyatrial7d: "trial",
  logivyaplus: "starter",
  logivyapro: "professional",
  trial: "trial",
  free: "trial",
  deneme: "trial",
  starter: "starter",
  basic: "starter",
  beginning: "starter",
  baslangic: "starter",
  professional: "professional",
  pro: "professional",
  profesyonel: "professional",
};

function normalizeAlias(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\u0131/g, "i")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]/g, "");
}

export function canonicalSubscriptionPlanCode(value?: string | null): SubscriptionPlanCode | null {
  if (!value) return null;
  return PLAN_ALIASES[normalizeAlias(value)] ?? null;
}

export function canonicalSubscriptionPlan(value?: string | null) {
  const code = canonicalSubscriptionPlanCode(value);
  return code ? CANONICAL_SUBSCRIPTION_PLANS[code] : null;
}

export function canonicalSubscriptionPlanCatalog() {
  return SUBSCRIPTION_PLAN_CODES.map((code) => CANONICAL_SUBSCRIPTION_PLANS[code]);
}

export function serializeCanonicalSubscriptionPlan(plan: CanonicalSubscriptionPlan) {
  return {
    canonicalCode: plan.canonicalCode,
    code: plan.code,
    slug: plan.slug,
    displayNameKey: plan.displayNameKey,
    descriptionKey: plan.descriptionKey,
    badgeKey: plan.badgeKey,
    ctaKey: plan.ctaKey,
    currency: plan.currency,
    monthlyPrice: plan.monthlyPriceMinor,
    yearlyPrice: plan.yearlyPriceMinor,
    yearlyMonthlyEquivalent: plan.yearlyMonthlyEquivalentMinor,
    trialDays: plan.trialDurationDays,
    limits: {
      accounts: plan.accountLimit,
      whatsappConnections: plan.whatsappConnectionLimit,
    },
    marketingDescription: { ...plan.marketingDescription },
    marketingSummaryGroups: {
      tr: plan.marketingSummaryGroups.tr.map((group) => ({ ...group })),
      en: plan.marketingSummaryGroups.en.map((group) => ({ ...group })),
    },
    seatClarification: { ...plan.seatClarification },
    marketingFeatures: {
      tr: [...plan.marketingFeatures.tr],
      en: [...plan.marketingFeatures.en],
    },
    technicalCapabilities: { ...plan.technicalCapabilities },
    signatureBehavior: plan.signatureBehavior,
    publicVisibility: plan.publicVisibility,
    effectiveVersion: plan.effectiveVersion,
    features: { ...plan.features },
    featureCodes: [...plan.featureCodes],
    billingIntervals: [...plan.billingIntervals],
    active: plan.active,
    sortOrder: plan.sortOrder,
  };
}

function fullLogisticsCapabilities(): CanonicalSubscriptionPlan["technicalCapabilities"] {
  return {
    marketplaceBrowse: true,
    listingCreate: true,
    listingManage: true,
    demandCreate: true,
    smartMatching: true,
    homeMovingAccess: true,
    partialLoadAccess: true,
    heavyHaulAccess: true,
    whatsappAccountConnect: true,
    whatsappGroupSend: true,
    whatsappContactSend: true,
    telegramAccountConnect: true,
    telegramGroupSend: true,
    facebookPageConnect: true,
    facebookPagePublish: true,
  };
}
