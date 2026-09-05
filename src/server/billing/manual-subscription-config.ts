import { createHash } from "node:crypto";

import type { BillingSellerConfiguration } from "@prisma/client";

export const LOGIVYA_BANK_CONFIGURATION_VERSION = "2026-07-28-v1";
export const LOGIVYA_SELLER_DISPLAY_NAME = "LOGIVYA";

export const LOGIVYA_BANK_TRANSFER = Object.freeze({
  version: LOGIVYA_BANK_CONFIGURATION_VERSION,
  accountHolder: "BURAK İDİM",
  bankName: "Ziraat Bankası",
  ibanDisplay: "TR08 0001 0002 8896 3148 1650 09",
  ibanNormalized: "TR080001000288963148165009",
});

export const LOGIVYA_BILLING_LEGAL_VERSION = "2026-08-10-v4";

export const BILLING_LEGAL_DOCUMENT_TYPES = [
  "PRE_INFORMATION_FORM",
  "DISTANCE_SALES_AGREEMENT",
  "REFUND_WITHDRAWAL_POLICY",
] as const;

export type BillingLegalDocumentTypeCode =
  (typeof BILLING_LEGAL_DOCUMENT_TYPES)[number];

export type PublicSellerIdentity = {
  officialName: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  phone: string;
  tradeRegistryNumber: string | null;
  mersisNumber: string | null;
};

export type BillingLegalDocument = {
  type: BillingLegalDocumentTypeCode;
  title: string;
  version: string;
  hash: string;
  content: string;
};

const REQUIRED_SELLER_FIELDS = [
  "officialName",
  "registeredAddress",
  "taxOffice",
  "taxNumber",
  "email",
  "phone",
] as const;

export function billingSellerConfigurationState(
  configuration: BillingSellerConfiguration | null,
) {
  const missingFields: string[] = REQUIRED_SELLER_FIELDS.filter(
    (field) => !configuration?.[field]?.trim(),
  );
  if (
    !configuration?.tradeRegistryNumber?.trim()
    && !configuration?.tradeRegistryNotApplicable
  ) {
    missingFields.push("tradeRegistryNumber");
  }
  if (
    !configuration?.mersisNumber?.trim()
    && !configuration?.mersisNotApplicable
  ) {
    missingFields.push("mersisNumber");
  }
  return {
    checkoutAvailable: missingFields.length === 0,
    missingFields: [...new Set<string>(missingFields)],
    identityVerified: Boolean(configuration?.verifiedAt),
    legalDocumentsApproved: Boolean(
      configuration?.legalDocumentsApprovedAt,
    ),
  };
}

export function publicSellerIdentity(
  configuration: BillingSellerConfiguration,
): PublicSellerIdentity {
  const state = billingSellerConfigurationState(configuration);
  if (!state.checkoutAvailable) {
    throw new Error("LEGAL_SELLER_CONFIGURATION_INCOMPLETE");
  }
  return {
    officialName: LOGIVYA_SELLER_DISPLAY_NAME,
    taxOffice: configuration.taxOffice!.trim(),
    taxNumber: configuration.taxNumber!.trim(),
    email: configuration.email!.trim(),
    phone: configuration.phone!.trim(),
    tradeRegistryNumber:
      configuration.tradeRegistryNumber?.trim() || null,
    mersisNumber: configuration.mersisNumber?.trim() || null,
  };
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sellerLines(seller: PublicSellerIdentity) {
  return [
    `Satıcı/Hizmet Sağlayıcı: ${LOGIVYA_SELLER_DISPLAY_NAME}`,
    `Vergi Dairesi / Vergi Numarası: ${seller.taxOffice} / ${seller.taxNumber}`,
    `E-posta: ${seller.email}`,
    `Telefon: ${seller.phone}`,
    seller.tradeRegistryNumber
      ? `Ticaret Sicil Numarası: ${seller.tradeRegistryNumber}`
      : null,
    seller.mersisNumber ? `MERSİS Numarası: ${seller.mersisNumber}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLogivyaBillingLegalDocuments(input: {
  seller: PublicSellerIdentity;
  buyerName: string;
  buyerEmail: string;
  buyerAddress?: string | null;
  planName: string;
  billingPeriodLabel: string;
  amountLabel: string;
  orderReference: string;
  transferDescription: string;
}): BillingLegalDocument[] {
  const seller = sellerLines(input.seller);
  const commonOrder = [
    `Alıcı: ${input.buyerName}`,
    `Alıcı E-posta: ${input.buyerEmail}`,
    `Alıcı Adresi: ${input.buyerAddress?.trim() || "Belirtilmedi"}`,
    `Plan: ${input.planName}`,
    `Abonelik Dönemi: ${input.billingPeriodLabel}`,
    `Toplam Tutar: ${input.amountLabel}`,
    `Talep Numarası: ${input.orderReference}`,
    `Havale/EFT seçilirse açıklama: ${input.transferDescription}`,
  ].join("\n");

  const definitions: Array<
    Omit<BillingLegalDocument, "version" | "hash">
  > = [
    {
      type: "PRE_INFORMATION_FORM",
      title: "Ön Bilgilendirme Formu",
      content: [
        "LOGIVYA ÖN BİLGİLENDİRME FORMU",
        seller,
        commonOrder,
        "Ödeme yöntemi olarak iyzico güvenli ödeme sayfasında banka/kredi kartı veya LOGIVYA tarafından bildirilen hesaba Havale/EFT seçilebilir. Kart seçildiğinde kart bilgileri LOGIVYA sunucularına gelmez ve LOGIVYA tarafından saklanmaz; ödeme iyzico altyapısında işlenir.",
        "Havale/EFT seçilirse ödemenin doğru hesapla eşleştirilmesi için LOGIVYA hesabına kayıtlı e-posta adresi havale açıklamasına eksiksiz yazılmalıdır. Plan, banka hesabında tutar ve açıklama doğrulandıktan sonra etkinleştirilir.",
        "iyzico ile kart ödemesinde plan, iyzico tarafından başarılı ödeme sonucu doğrulandıktan sonra etkinleştirilir. Başarısız, iptal edilmiş veya doğrulanamayan işlemler abonelik başlatmaz.",
        "Bu satın alma seçilen aylık veya yıllık hizmet dönemi için tek seferlik tahsilattır; iyzico üzerinden otomatik yenileme talimatı oluşturulmaz. Yeni dönem için kullanıcı yeniden satın alma işlemi başlatır.",
        "Dijital hizmetin kapsamı, dönem bilgisi, toplam hesap sayısı ve özellikleri sipariş özetinde gösterilir. Kullanıcı, ödeme öncesinde bu özeti ve güncel sözleşmeleri incelemelidir.",
        "Uyuşmazlık, iptal, iade ve tüketici başvuruları yürürlükteki mevzuat kapsamında değerlendirilir. Destek talepleri yukarıdaki satıcı e-posta adresine iletilebilir.",
      ].join("\n\n"),
    },
    {
      type: "DISTANCE_SALES_AGREEMENT",
      title: "Mesafeli Satış Sözleşmesi",
      content: [
        "LOGIVYA MESAFELİ SATIŞ SÖZLEŞMESİ",
        seller,
        commonOrder,
        "Sözleşmenin konusu, sipariş özetinde belirtilen LOGIVYA yazılım aboneliğinin seçilen ödeme yöntemiyle satın alınması ve başarılı ödeme doğrulamasından sonra ilgili dönem için kullanıma açılmasıdır.",
        "Kart ödemesi iyzico ödeme sayfasında işlenir. LOGIVYA kart numarası, son kullanma tarihi veya güvenlik kodunu toplamaz ve saklamaz. LOGIVYA yalnızca ödeme sonucunu, işlem referansını ve aboneliği etkinleştirmek için gerekli sınırlı kayıtları işler.",
        "Havale/EFT seçen alıcı, ödeme açıklamasında LOGIVYA hesabına kayıtlı e-posta adresini kullanacağını; farklı veya eksik açıklamanın doğrulama için ek bilgi gerektirebileceğini kabul eder.",
        "Abonelik talebi tek başına ödeme alındığı veya hizmetin etkinleştirildiği anlamına gelmez. Kart ödemesinde iyzico sonucu; Havale/EFT'de banka hesabındaki tutar ve açıklama doğrulanmadan plan etkinleştirilmez.",
        "Ödeme doğrulanırsa dijital hizmet paket etkinleştirmesinden hemen sonra başlar. Mevcut aktif aynı planın yenilenmesinde kalan ücretli süre korunur ve yeni dönem mevcut bitiş tarihinden uzatılır.",
        "Başarısız veya doğrulanamayan işlemde satıcı ek bilgi isteyebilir ya da talebi reddedebilir. Tarafların emredici mevzuattan doğan hakları saklıdır.",
      ].join("\n\n"),
    },
    {
      type: "REFUND_WITHDRAWAL_POLICY",
      title: "İade ve Cayma Hakkı Politikası",
      content: [
        "LOGIVYA İADE VE CAYMA HAKKI POLİTİKASI",
        seller,
        commonOrder,
        "Ödeme henüz doğrulanmamış ve abonelik etkinleştirilmemişse kullanıcı abonelik sayfasından talebi iptal edebilir veya satıcıyla iletişime geçebilir.",
        "Ödeme yapıldığı halde eşleştirme ya da doğrulama tamamlanmadıysa kullanıcı talep numarası ve kayıtlı e-posta adresiyle destek talebi açmalıdır. İnceleme sonucunda ödeme ve hesap sahibi bilgileri doğrulanır.",
        "Kullanıcı, açık onayıyla dijital hizmetin ödeme onayı ve paket etkinleştirmesinden sonra derhal başlatılmasını talep eder. Etkinleştirme öncesinde hizmet başlamaz.",
        "Kartla alınan ve iadesi onaylanan ödemeler, iyzico işlem referansı üzerinden kullanılan kartın bankacılık kanallarına iade edilir. Bankanın yansıtma süresi LOGIVYA'nın kontrolü dışındadır.",
        "Abonelik etkinleştirildikten sonraki cayma ve iade talepleri, hizmetin ifasına başlanma durumu ve yürürlükteki tüketici mevzuatı dikkate alınarak değerlendirilir. Bu metin yasal olarak vazgeçilemeyen tüketici haklarını sınırlamaz.",
        "Kullanıcı parola, MFA kodu veya başka bir kimlik doğrulama sırrı paylaşmamalıdır.",
      ].join("\n\n"),
    },
  ];

  return definitions.map((document) => ({
    ...document,
    version: LOGIVYA_BILLING_LEGAL_VERSION,
    hash: digest(
      `${document.type}\n${LOGIVYA_BILLING_LEGAL_VERSION}\n${document.content}`,
    ),
  }));
}
