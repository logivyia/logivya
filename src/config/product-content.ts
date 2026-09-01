export const PRODUCT_CONTENT_VERSION = "2026-08-29-unified-v1" as const;
export const PRODUCT_CONTENT_UPDATED_AT = "2026-08-29T19:30:00+03:00" as const;

export const PRODUCT_FEATURE_STATUSES = ["INTERNAL", "BETA", "PUBLIC", "COMING_SOON", "DISABLED"] as const;
export type ProductFeatureStatusValue = (typeof PRODUCT_FEATURE_STATUSES)[number];

export const PRODUCT_FEATURE_KEYS = [
  "WHATSAPP_ACCOUNTS",
  "TELEGRAM_ACCOUNTS",
  "FACEBOOK_PAGES",
  "GENERAL_MARKETPLACE",
  "LIVE_LISTINGS",
  "SAVED_DEMANDS",
  "INTELLIGENT_MATCHING",
  "HOME_MOVING",
  "PARTIAL_LOAD",
  "HEAVY_HAUL",
  "IMAGE_SENDING",
  "DOCUMENT_SENDING",
  "VIDEO_SENDING",
  "WHATSAPP_LISTING_INGESTION",
  "TELEGRAM_LISTING_INGESTION",
  "SOCIAL_PUBLISHING",
] as const;

export type ProductFeatureKey = (typeof PRODUCT_FEATURE_KEYS)[number];

export const DEFAULT_PRODUCT_FEATURE_STATUS: Readonly<Record<ProductFeatureKey, ProductFeatureStatusValue>> = {
  WHATSAPP_ACCOUNTS: "PUBLIC",
  TELEGRAM_ACCOUNTS: "BETA",
  FACEBOOK_PAGES: "INTERNAL",
  GENERAL_MARKETPLACE: "PUBLIC",
  LIVE_LISTINGS: "BETA",
  SAVED_DEMANDS: "PUBLIC",
  INTELLIGENT_MATCHING: "BETA",
  HOME_MOVING: "BETA",
  PARTIAL_LOAD: "BETA",
  HEAVY_HAUL: "BETA",
  IMAGE_SENDING: "PUBLIC",
  DOCUMENT_SENDING: "PUBLIC",
  VIDEO_SENDING: "PUBLIC",
  WHATSAPP_LISTING_INGESTION: "INTERNAL",
  TELEGRAM_LISTING_INGESTION: "INTERNAL",
  SOCIAL_PUBLISHING: "INTERNAL",
};

export const PROVIDER_GATED_FEATURES = new Set<ProductFeatureKey>(["FACEBOOK_PAGES", "SOCIAL_PUBLISHING"]);

export type ProductLocale = "tr" | "en";

const tr = {
  category: "Canlı Lojistik Pazarı ve Akıllı Eşleştirme Platformu",
  headline: "Lojistiği Logivya ile Yönet",
  description: "Yük, araç ve şoför ilanları oluşturun; canlı lojistik pazarındaki fırsatları takip edin ve taleplerinize uygun sonuçları akıllı eşleştirmeyle bulun. WhatsApp ve Telegram entegrasyonlarıyla ilan, paylaşım ve iletişim süreçlerinizi tek yerden yönetin.",
  descriptionWithFacebook: "Yük, araç ve şoför ilanları oluşturun; canlı lojistik pazarındaki fırsatları takip edin ve taleplerinize uygun sonuçları akıllı eşleştirmeyle bulun. WhatsApp, Telegram ve Facebook Sayfaları entegrasyonlarıyla ilan, paylaşım ve iletişim süreçlerinizi tek yerden yönetin.",
  slogan: "İlanını Yayınla. Uygun Fırsatı Bul. Lojistiği Logivya ile Yönet.",
  shortDefinition: "Logivya; yük, araç ve şoför ilanlarını canlı lojistik pazarı ve akıllı eşleştirme ile tek merkezde buluşturan dijital lojistik platformudur.",
  extendedDefinition: "Logivya; genel lojistik, evden eve nakliyat, parsiyel yük ve ağır nakliyat alanlarında yük, araç ve şoför ilanları oluşturmayı, canlı ilanları takip etmeyi, uygun talepler oluşturmayı ve eşleşen fırsatlar bulunduğunda bildirim almayı sağlayan akıllı lojistik platformudur. WhatsApp ve Telegram gruplarını destekleyen çok kanallı altyapısı sayesinde ilan, paylaşım ve iletişim operasyonlarının tek merkezden yönetilmesine yardımcı olur.",
  primaryCta: "7 Gün Ücretsiz Dene",
  liveCta: "Canlı İlanları Gör",
  featureCards: [
    { key: "GENERAL_MARKETPLACE", title: "Canlı Lojistik Pazarı", description: "Yük, araç ve şoför ilanlarını anlık olarak görüntüleyin, yayınlayın ve yönetin." },
    { key: "INTELLIGENT_MATCHING", title: "Akıllı Talep Eşleştirme", description: "Aradığınız yük, araç veya şoför için talep oluşturun; uygun ilan bulunduğunda anında bildirim alın." },
    { key: "HOME_MOVING", title: "Sektörel Lojistik Alanları", description: "Evden eve nakliyat, parsiyel yük ve ağır nakliyat fırsatlarına sektörünüze özel alanlardan ulaşın." },
    { key: "GENERAL_MARKETPLACE", title: "İlan ve Operasyon Yönetimi", description: "İlanlarınızı oluşturun, düzenleyin, durdurun ve bütün operasyon geçmişinizi tek yerden yönetin." },
    { key: "WHATSAPP_ACCOUNTS", title: "WhatsApp ve Telegram Entegrasyonu", description: "Grup ve kişi iletişiminizi yönetin, lojistik ilanlarını ilgili kanallarda paylaşın ve operasyon akışınızı hızlandırın." },
    { key: "FACEBOOK_PAGES", title: "Facebook Sayfaları ve İçerik Yönetimi", description: "Facebook Sayfalarınızı bağlayın, içerik oluşturun ve yayınlarınızı yönetin." },
  ],
  plans: {
    trial: { name: "Logivya 7 Gün Ücretsiz", description: "Logivya’nın canlı lojistik, ilan, eşleştirme ve iletişim özelliklerini 7 gün boyunca ücretsiz deneyin." },
    starter: { name: "Logivya Plus", description: "Canlı lojistik pazarını, ilan süreçlerini ve iletişim operasyonlarını ekip halinde yönetin." },
    professional: { name: "Logivya Pro", description: "Gelişmiş lojistik, akıllı eşleştirme ve mesajlaşma operasyonlarını ekip halinde yönetin." },
  },
  store: {
    subtitle: "Akıllı Lojistik Pazarı",
    shortDescription: "Yük, araç ve şoför ilanlarını yayınlayın; canlı fırsatları ve akıllı eşleşmeleri tek yerden yönetin.",
  },
  social: {
    shortBio: "Canlı lojistik pazarı, akıllı eşleştirme ve lojistik operasyon yönetimi.",
    longBio: "Yük, araç ve şoför ilanlarını yayınlayın; canlı fırsatları takip edin ve akıllı eşleştirmeyle doğru sonucu bulun.",
  },
} as const;

const en = {
  category: "Live Logistics Marketplace and Intelligent Matching Platform",
  headline: "Manage Logistics with LOGIVYA",
  description: "Create load, vehicle, and driver listings; follow opportunities in the live logistics marketplace and find relevant results through intelligent matching. Manage listing, sharing, and communication workflows with WhatsApp and Telegram integrations.",
  descriptionWithFacebook: "Create load, vehicle, and driver listings; follow opportunities in the live logistics marketplace and find relevant results through intelligent matching. Manage listing, sharing, and communication workflows with WhatsApp, Telegram, and Facebook Pages integrations.",
  slogan: "Publish Your Listing. Find the Right Opportunity. Manage Logistics with LOGIVYA.",
  shortDefinition: "LOGIVYA is a digital logistics platform that brings load, vehicle, and driver listings together through a live marketplace and intelligent matching.",
  extendedDefinition: "LOGIVYA is an intelligent logistics platform for creating load, vehicle, and driver listings, following live opportunities, creating saved demands, and receiving notifications for relevant matches across general logistics, home moving, partial loads, and heavy haulage. It also brings authorized WhatsApp and Telegram group and contact communication into one operational workspace.",
  primaryCta: "Try Free for 7 Days",
  liveCta: "View Live Listings",
  featureCards: [
    { key: "GENERAL_MARKETPLACE", title: "Live Logistics Marketplace", description: "View, publish, and manage load, vehicle, and driver listings as they become available." },
    { key: "INTELLIGENT_MATCHING", title: "Intelligent Demand Matching", description: "Create a demand for a load, vehicle, or driver and receive notifications when relevant listings appear." },
    { key: "HOME_MOVING", title: "Specialized Logistics Areas", description: "Reach home moving, partial-load, and heavy-haul opportunities through focused sector experiences." },
    { key: "GENERAL_MARKETPLACE", title: "Listing and Operations Management", description: "Create, edit, pause, and manage listings and operational history in one place." },
    { key: "WHATSAPP_ACCOUNTS", title: "WhatsApp and Telegram Integrations", description: "Manage group and contact communication and accelerate logistics sharing workflows." },
    { key: "FACEBOOK_PAGES", title: "Facebook Pages Content Management", description: "Connect managed Facebook Pages, create content, and manage Page posts." },
  ],
  plans: {
    trial: { name: "LOGIVYA Free for 7 Days", description: "Try LOGIVYA’s live logistics, listing, matching, and communication features free for 7 days." },
    starter: { name: "LOGIVYA Plus", description: "Manage the live logistics marketplace, listing workflows, and communication operations as a team." },
    professional: { name: "LOGIVYA Pro", description: "Manage advanced logistics, intelligent matching, and messaging operations as a team." },
  },
  store: {
    subtitle: "Intelligent Logistics Market",
    shortDescription: "Publish load, vehicle, and driver listings and manage live opportunities and intelligent matches in one place.",
  },
  social: {
    shortBio: "Live logistics marketplace, load–vehicle–driver listings, and intelligent matching.",
    longBio: "LOGIVYA brings load, vehicle, and driver listings together through a live logistics marketplace, saved demands, and intelligent matching.",
  },
} as const;

export const PRODUCT_CONTENT = { tr, en } as const;

export function productContent(locale?: string | null) {
  return locale?.toLocaleLowerCase("en-US").startsWith("tr") ? PRODUCT_CONTENT.tr : PRODUCT_CONTENT.en;
}

export function isPublicProductFeature(status: ProductFeatureStatusValue) {
  return status === "PUBLIC";
}

export function isVisibleProductFeature(status: ProductFeatureStatusValue, audience: "PUBLIC" | "AUTHENTICATED" | "INTERNAL") {
  if (status === "DISABLED") return false;
  if (audience === "INTERNAL") return true;
  if (audience === "AUTHENTICATED") return status === "PUBLIC" || status === "BETA" || status === "COMING_SOON";
  return status === "PUBLIC" || status === "COMING_SOON";
}
