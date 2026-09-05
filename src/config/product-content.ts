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

export type ProductLocale = "tr" | "en" | "ar";

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

const ar = {
  category: "سوق الخدمات اللوجستية المباشر ومنصة المطابقة الذكية",
  headline: "أدِر أعمالك اللوجستية مع Logivya",
  description: "أنشئ إعلانات الشحنات والمركبات والسائقين، وتابع الفرص في السوق اللوجستي المباشر، واعثر على النتائج المناسبة عبر المطابقة الذكية. أدِر الإعلانات والمشاركة والتواصل من مكان واحد من خلال تكاملَي WhatsApp وTelegram.",
  descriptionWithFacebook: "أنشئ إعلانات الشحنات والمركبات والسائقين، وتابع الفرص في السوق اللوجستي المباشر، واعثر على النتائج المناسبة عبر المطابقة الذكية. أدِر الإعلانات والمشاركة والتواصل من مكان واحد من خلال تكاملات WhatsApp وTelegram وصفحات Facebook.",
  slogan: "انشر إعلانك. اعثر على الفرصة المناسبة. أدِر أعمالك اللوجستية مع Logivya.",
  shortDefinition: "Logivya منصة لوجستية رقمية تجمع إعلانات الشحنات والمركبات والسائقين في سوق مباشر مدعوم بالمطابقة الذكية.",
  extendedDefinition: "Logivya منصة لوجستية ذكية لإنشاء إعلانات الشحنات والمركبات والسائقين، ومتابعة الفرص المباشرة، وإنشاء طلبات محفوظة، وتلقي إشعارات عند العثور على تطابقات مناسبة في الخدمات اللوجستية العامة والنقل المنزلي والشحن الجزئي والنقل الثقيل. كما تجمع اتصالات مجموعات وجهات اتصال WhatsApp وTelegram المصرح بها في مساحة عمل تشغيلية واحدة.",
  primaryCta: "جرّب مجانًا لمدة 7 أيام",
  liveCta: "عرض الإعلانات المباشرة",
  featureCards: [
    { key: "GENERAL_MARKETPLACE", title: "السوق اللوجستي المباشر", description: "اعرض إعلانات الشحنات والمركبات والسائقين وانشرها وأدرها فور توفرها." },
    { key: "INTELLIGENT_MATCHING", title: "مطابقة الطلبات الذكية", description: "أنشئ طلبًا لشحنة أو مركبة أو سائق وتلقَّ إشعارًا عند ظهور إعلان مناسب." },
    { key: "HOME_MOVING", title: "مجالات لوجستية متخصصة", description: "تابع فرص النقل المنزلي والشحن الجزئي والنقل الثقيل عبر تجارب مخصصة لكل قطاع." },
    { key: "GENERAL_MARKETPLACE", title: "إدارة الإعلانات والعمليات", description: "أنشئ الإعلانات وعدّلها وأوقفها مؤقتًا وأدِر سجل العمليات من مكان واحد." },
    { key: "WHATSAPP_ACCOUNTS", title: "تكامل WhatsApp وTelegram", description: "أدِر تواصل المجموعات وجهات الاتصال وسرّع عمليات مشاركة الفرص اللوجستية." },
    { key: "FACEBOOK_PAGES", title: "إدارة محتوى صفحات Facebook", description: "اربط الصفحات التي تديرها وأنشئ المحتوى وأدِر منشورات الصفحات." },
  ],
  plans: {
    trial: { name: "Logivya مجانًا لمدة 7 أيام", description: "جرّب ميزات السوق المباشر والإعلانات والمطابقة والتواصل مجانًا لمدة 7 أيام." },
    starter: { name: "Logivya Plus", description: "أدِر السوق اللوجستي المباشر وعمليات الإعلانات والتواصل ضمن فريق." },
    professional: { name: "Logivya Pro", description: "أدِر العمليات اللوجستية المتقدمة والمطابقة الذكية والمراسلات ضمن فريق." },
  },
  store: {
    subtitle: "السوق اللوجستي الذكي",
    shortDescription: "انشر إعلانات الشحنات والمركبات والسائقين وأدِر الفرص المباشرة والتطابقات الذكية من مكان واحد.",
  },
  social: {
    shortBio: "سوق لوجستي مباشر وإعلانات للشحنات والمركبات والسائقين ومطابقة ذكية.",
    longBio: "تجمع Logivya إعلانات الشحنات والمركبات والسائقين عبر سوق لوجستي مباشر وطلبات محفوظة ومطابقة ذكية.",
  },
} as const;

export const PRODUCT_CONTENT = { tr, en, ar } as const;

export function productContent(locale?: string | null) {
  const normalized = locale?.toLocaleLowerCase("en-US");
  if (normalized?.startsWith("tr")) return PRODUCT_CONTENT.tr;
  if (normalized?.startsWith("ar")) return PRODUCT_CONTENT.ar;
  return PRODUCT_CONTENT.en;
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
