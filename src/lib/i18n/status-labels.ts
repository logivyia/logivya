import type { Locale } from "@/i18n/config";

type LabelMap = Partial<Record<Locale, Record<string, string>>>;

const fallbackByLocale: Record<string, "tr" | "en"> = {
  tr: "tr",
  en: "en",
  de: "en",
  ru: "en",
  zh: "en",
  ar: "en",
  az: "tr",
  ro: "en",
  sr: "en",
  hr: "en",
  fa: "en",
};

const whatsappStatusLabels: LabelMap = {
  tr: {
    ACTIVE: "BAĞLI",
    CONNECTED: "BAĞLI",
    DISCONNECTED: "BAĞLI DEĞİL",
    FAILED: "BAĞLANTI BAŞARISIZ",
    ERROR: "BAĞLANTI BAŞARISIZ",
    PENDING_QR: "QR BEKLENİYOR",
    QR_READY: "QR BEKLENİYOR",
    PENDING_PHONE: "TELEFON KODU BEKLENİYOR",
    PENDING_PAIRING: "TELEFON KODU BEKLENİYOR",
    PAIRING_CODE_READY: "TELEFON KODU BEKLENİYOR",
    CONNECTING: "BAĞLANIYOR",
    RECONNECT_REQUIRED: "YENİDEN BAĞLANTI GEREKLİ",
    ARCHIVED: "ARŞİVLENDİ",
    NEW: "BAĞLI DEĞİL",
  },
  en: {
    ACTIVE: "CONNECTED",
    CONNECTED: "CONNECTED",
    DISCONNECTED: "NOT CONNECTED",
    FAILED: "CONNECTION FAILED",
    ERROR: "CONNECTION FAILED",
    PENDING_QR: "QR PENDING",
    QR_READY: "QR PENDING",
    PENDING_PHONE: "PHONE CODE PENDING",
    PENDING_PAIRING: "PHONE CODE PENDING",
    PAIRING_CODE_READY: "PHONE CODE PENDING",
    CONNECTING: "CONNECTING",
    RECONNECT_REQUIRED: "RECONNECT REQUIRED",
    ARCHIVED: "ARCHIVED",
    NEW: "NOT CONNECTED",
  },
};

const subscriptionStatusLabels: LabelMap = {
  tr: {
    TRIAL: "Deneme",
    TRIALING: "Deneme",
    ACTIVE: "Aktif",
    EXPIRED: "Süresi Doldu",
    SUSPENDED: "Askıya Alındı",
    CANCELLED: "İptal Edildi",
    CANCELED: "İptal Edildi",
    MANUAL_PENDING: "Onay Bekliyor",
    PAST_DUE: "Ödeme Gecikti",
  },
  en: {
    TRIAL: "Trial",
    TRIALING: "Trial",
    ACTIVE: "Active",
    EXPIRED: "Expired",
    SUSPENDED: "Suspended",
    CANCELLED: "Cancelled",
    CANCELED: "Cancelled",
    MANUAL_PENDING: "Pending Approval",
    PAST_DUE: "Past Due",
  },
};

const paymentStatusLabels: LabelMap = {
  tr: {
    PENDING: "Bekliyor",
    MANUALLY_CONFIRMED: "Manuel Onaylandı",
    PAID: "Ödendi",
    SUCCEEDED: "Başarılı",
    FAILED: "Başarısız",
    REJECTED: "Reddedildi",
    REFUNDED: "İade Edildi",
  },
  en: {
    PENDING: "Pending",
    MANUALLY_CONFIRMED: "Manually Confirmed",
    PAID: "Paid",
    SUCCEEDED: "Succeeded",
    FAILED: "Failed",
    REJECTED: "Rejected",
    REFUNDED: "Refunded",
  },
};

const invoiceStatusLabels: LabelMap = {
  tr: {
    DRAFT: "Taslak",
    ISSUED: "Kesildi",
    PAID: "Ödendi",
    CANCELED: "İptal Edildi",
    CANCELLED: "İptal Edildi",
    FAILED: "Başarısız",
  },
  en: {
    DRAFT: "Draft",
    ISSUED: "Issued",
    PAID: "Paid",
    CANCELED: "Canceled",
    CANCELLED: "Cancelled",
    FAILED: "Failed",
  },
};

const messageStatusLabels: LabelMap = {
  tr: {
    COMPLETED: "Tamamlandı",
    PARTIALLY_COMPLETED: "Kısmen Tamamlandı",
    FAILED: "Başarısız",
    PENDING: "Bekliyor",
    QUEUED: "Sırada",
    SCHEDULED: "Planlandı",
    SENDING: "Gönderiliyor",
    CANCELED: "İptal Edildi",
    CANCELLED: "İptal Edildi",
    DELETED: "Silindi",
    DRAFT: "Taslak",
  },
  en: {
    COMPLETED: "Completed",
    PARTIALLY_COMPLETED: "Partially Completed",
    FAILED: "Failed",
    PENDING: "Pending",
    QUEUED: "Queued",
    SCHEDULED: "Scheduled",
    SENDING: "Sending",
    CANCELED: "Canceled",
    CANCELLED: "Cancelled",
    DELETED: "Deleted",
    DRAFT: "Draft",
  },
};

const adminMenuLabels: LabelMap = {
  tr: {
    dashboard: "Yönetici Paneli",
    companies: "Şirketler",
    users: "Kullanıcılar",
    billing: "Faturalandırma",
    subscriptions: "Abonelikler",
    invoices: "Faturalar",
    payments: "Ödemeler",
    whatsappAccounts: "WhatsApp Hesapları",
    campaigns: "Kampanyalar",
    support: "Destek",
    security: "Güvenlik",
    compliance: "Uyumluluk",
    audit: "Denetim Merkezi",
    activity: "Aktivite Merkezi",
    notifications: "Bildirimler",
    dataRequests: "Veri Talepleri",
    metrics: "Metrikler",
    systemHealth: "Sistem Sağlığı",
    backups: "Yedekler",
    disasterRecovery: "Felaket Kurtarma",
    featureFlags: "Özellik Bayrakları",
    announcements: "Duyurular",
    apiUsage: "API Kullanımı",
    webhooks: "Webhooklar",
    platformSettings: "Platform Ayarları",
    settings: "Ayarlar",
    superAdmin: "Süper Yönetici",
  },
  en: {
    dashboard: "Executive Dashboard",
    companies: "Companies",
    users: "Users",
    billing: "Billing",
    subscriptions: "Subscriptions",
    invoices: "Invoices",
    payments: "Payments",
    whatsappAccounts: "WhatsApp Accounts",
    campaigns: "Campaigns",
    support: "Support",
    security: "Security",
    compliance: "Compliance",
    audit: "Audit Center",
    activity: "Activity Center",
    notifications: "Notifications",
    dataRequests: "Data Requests",
    metrics: "Metrics",
    systemHealth: "System Health",
    backups: "Backups",
    disasterRecovery: "Disaster Recovery",
    featureFlags: "Feature Flags",
    announcements: "Announcements",
    apiUsage: "API Usage",
    webhooks: "Webhooks",
    platformSettings: "Platform Settings",
    settings: "Settings",
    superAdmin: "Super Admin",
  },
};

function labelFrom(map: LabelMap, key: string, locale: Locale, fallbackKey: string) {
  const normalized = key.trim().toUpperCase();
  const localeGroup = fallbackByLocale[locale] ?? "en";
  const label = map[locale]?.[normalized] ?? map[locale]?.[key] ?? map[localeGroup]?.[normalized] ?? map[localeGroup]?.[key];
  if (!label && process.env.NODE_ENV === "development") {
    console.warn(`[i18n] missing display label for ${fallbackKey}: ${key}`);
  }
  return label ?? map[localeGroup]?.UNKNOWN ?? (localeGroup === "tr" ? "Bilinmiyor" : "Unknown");
}

export function getWhatsAppStatusLabel(status: string, locale: Locale) {
  return labelFrom(whatsappStatusLabels, status, locale, "whatsappStatus");
}

export function getSubscriptionStatusLabel(status: string, locale: Locale) {
  return labelFrom(subscriptionStatusLabels, status, locale, "subscriptionStatus");
}

export function getPaymentStatusLabel(status: string, locale: Locale) {
  return labelFrom(paymentStatusLabels, status, locale, "paymentStatus");
}

export function getInvoiceStatusLabel(status: string, locale: Locale) {
  return labelFrom(invoiceStatusLabels, status, locale, "invoiceStatus");
}

export function getMessageStatusLabel(status: string, locale: Locale) {
  return labelFrom(messageStatusLabels, status, locale, "messageStatus");
}

export function getAdminMenuLabel(key: string, locale: Locale) {
  return labelFrom(adminMenuLabels, key, locale, "adminMenu");
}
