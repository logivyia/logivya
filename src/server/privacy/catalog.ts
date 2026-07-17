import "server-only";

export const PRIVACY_POLICY_VERSION = "2026-07-16-draft-1";
export const PRIVACY_PREFERENCE_VERSION = "2026-07-16-v1";
export const PRIVACY_RETENTION_POLICY_VERSION = "2026-07-16-draft-1";

export type PrivacyPurpose = {
  code: string;
  label: string;
  description: string;
  required: boolean;
  defaultEnabled: boolean;
  consentType: "PRIVACY_POLICY" | "TERMS_OF_SERVICE" | "KVKK" | "MARKETING";
  legalStatus: "LEGAL_REVIEW_REQUIRED";
};

export const PRIVACY_PURPOSES: readonly PrivacyPurpose[] = [
  {
    code: "ESSENTIAL_SERVICE",
    label: "Zorunlu hizmet islemleri",
    description: "Oturum, guvenlik, tenant izolasyonu ve talep edilen temel hizmetler.",
    required: true,
    defaultEnabled: true,
    consentType: "TERMS_OF_SERVICE",
    legalStatus: "LEGAL_REVIEW_REQUIRED",
  },
  {
    code: "SECURITY_AND_FRAUD_PREVENTION",
    label: "Guvenlik ve kotuye kullanim onleme",
    description: "Hesap guvenligi, denetim izi, oran sinirlama ve olay inceleme.",
    required: true,
    defaultEnabled: true,
    consentType: "KVKK",
    legalStatus: "LEGAL_REVIEW_REQUIRED",
  },
  {
    code: "PRODUCT_ANALYTICS",
    label: "Urun analitigi",
    description: "Urun kullaniminin toplulastirilmis olcumleri. Tercih verilene kadar kapali kalir.",
    required: false,
    defaultEnabled: false,
    consentType: "PRIVACY_POLICY",
    legalStatus: "LEGAL_REVIEW_REQUIRED",
  },
  {
    code: "CRASH_DIAGNOSTICS",
    label: "Cokme ve hata tanilama",
    description: "Kisisel veri azaltma kurallariyla teknik hata tanilama. Tercih verilene kadar kapali kalir.",
    required: false,
    defaultEnabled: false,
    consentType: "PRIVACY_POLICY",
    legalStatus: "LEGAL_REVIEW_REQUIRED",
  },
  {
    code: "MARKETING_COMMUNICATIONS",
    label: "Pazarlama iletileri",
    description: "Kampanya ve urun duyurulari. Hizmet iletilerinden ayridir.",
    required: false,
    defaultEnabled: false,
    consentType: "MARKETING",
    legalStatus: "LEGAL_REVIEW_REQUIRED",
  },
] as const;

export const PROCESSOR_REGISTER = [
  { provider: "Vercel", purpose: "Web ve API barindirma", data: ["request metadata", "account data"], review: "LEGAL_REVIEW_REQUIRED" },
  { provider: "Render", purpose: "WhatsApp worker barindirma", data: ["tenant-scoped WhatsApp metadata", "queue metadata"], review: "LEGAL_REVIEW_REQUIRED" },
  { provider: "PostgreSQL provider", purpose: "Birincil veritabani", data: ["application records"], review: "LEGAL_REVIEW_REQUIRED" },
  { provider: "Redis provider", purpose: "Kuyruk, kilit ve oran sinirlama", data: ["pseudonymous identifiers", "transient job state"], review: "LEGAL_REVIEW_REQUIRED" },
  { provider: "Cloudflare R2", purpose: "Sifreli yedek ve gizlilik disari aktarma nesneleri", data: ["client-side encrypted archives"], review: "LEGAL_REVIEW_REQUIRED" },
  { provider: "Expo", purpose: "Mobil bildirim teslimi", data: ["push token", "minimal notification metadata"], review: "LEGAL_REVIEW_REQUIRED" },
  { provider: "Firebase Analytics", purpose: "Istege bagli urun analitigi", data: ["allowlisted app events"], review: "LEGAL_REVIEW_REQUIRED" },
  { provider: "Sentry", purpose: "Istege bagli hata tanilama", data: ["redacted diagnostics"], review: "LEGAL_REVIEW_REQUIRED" },
] as const;

export const INTERNATIONAL_TRANSFER_REGISTER = PROCESSOR_REGISTER.map((processor) => ({
  provider: processor.provider,
  destination: "PROVIDER_REGION_CONFIRMATION_REQUIRED",
  mechanism: "LEGAL_REVIEW_REQUIRED",
  safeguards: "DPA_AND_TRANSFER_ASSESSMENT_REQUIRED",
}));

export const RETENTION_CATALOG = [
  { category: "privacy-export-object", days: 7, action: "delete encrypted object and expire token" },
  { category: "privacy-export-job-metadata", days: 90, action: "minimize operational metadata" },
  { category: "privacy-request", days: null, action: "LEGAL REVIEW REQUIRED" },
  { category: "consent-evidence", days: null, action: "LEGAL REVIEW REQUIRED" },
  { category: "security-event", days: null, action: "configured by SECURITY_EVENT_RETENTION_DAYS" },
  { category: "audit-log", days: null, action: "LEGAL REVIEW REQUIRED; append-only" },
] as const;

export const MOBILE_PERMISSION_INVENTORY = [
  { permission: "INTERNET", purpose: "API ve talep edilen ag islemleri", runtimePrompt: false },
  { permission: "POST_NOTIFICATIONS", purpose: "Kullanici tarafindan etkinlestirilen bildirimler", runtimePrompt: true },
  { permission: "VIBRATE", purpose: "Bildirim geri bildirimi", runtimePrompt: false },
] as const;

export function findPrivacyPurpose(code: string) {
  return PRIVACY_PURPOSES.find((purpose) => purpose.code === code);
}
