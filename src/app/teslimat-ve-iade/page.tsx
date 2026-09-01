import Link from "next/link";

import { LegalPage } from "@/components/legal-page";
import { getServerLocale } from "@/i18n/server";

const deliveryAndReturnsCopy = {
  tr: {
    title: "Teslimat ve İade",
    version: "Son güncelleme: 10 Ağustos 2026",
    intro: "Bu politika, Logivya web sitesi üzerinden iyzico aracılığıyla satın alınan dijital aboneliklerin teslimat, iptal ve iade esaslarını açıklar.",
    storeScope: "App Store veya Google Play üzerinden yapılan satın alımlar, ilgili mağazanın ödeme, iptal ve iade kurallarına tabidir. Bu sayfa yalnızca Logivya web sitesindeki ödemeleri kapsar.",
    deliveryTitle: "Dijital hizmetin teslimatı",
    deliveryBody: "Logivya dijital bir hizmettir; fiziksel ürün veya kargo teslimatı yapılmaz. Web aboneliği, ödemenin iyzico tarafından başarılı olarak bildirilmesi ve gerekli güvenlik kontrollerinin tamamlanmasının ardından kullanıcı hesabına elektronik olarak tanımlanır.",
    deliveryAccess: "Hizmete erişim, satın alma sırasında kullanılan Logivya hesabı üzerinden sağlanır. Ödeme başarılı olduğu hâlde abonelik etkinleşmezse kayıtlı e-posta adresinizden destek ekibimize başvurun.",
    cancellationTitle: "Abonelik iptali",
    cancellationBody: "Bir sonraki yenilemeyi durdurmak için uygulama içindeki destek merkezi üzerinden veya kayıtlı e-posta adresinizden support@logivya.com adresine yazarak iptal talebi oluşturabilirsiniz. İptal, aksi zorunlu olmadıkça, mevcut ödenmiş dönemin sonunda yürürlüğe girer ve gelecek dönem tahsilatlarını durdurur.",
    withdrawalTitle: "Cayma hakkı ve iade değerlendirmesi",
    withdrawalBody: "Dijital hizmetin hemen başlatılması için onay verilmesi ve hizmetin ifasına başlanması hâlinde cayma hakkı, yürürlükteki mevzuattaki istisnalar kapsamında sınırlanabilir. Tüketicinin emredici mevzuattan doğan hakları saklıdır.",
    refundIntro: "Aşağıdaki durumlarda iade talebi incelenebilir:",
    refundItems: [
      "Başarılı tahsilata rağmen aboneliğin teknik nedenle etkinleştirilememesi.",
      "Aynı işlem için mükerrer tahsilat yapılması.",
      "Satın alınan dijital hizmetin Logivya kaynaklı bir nedenle teslim edilememesi.",
      "Yürürlükteki tüketici mevzuatının iade gerektirdiği diğer hâller.",
    ],
    requestTitle: "İade talebi nasıl iletilir?",
    requestBody: "Talebinizi, hesabınıza kayıtlı e-posta adresinden support@logivya.com adresine gönderin. Hesap sahibinin adını, ödeme tarihini, tutarı ve varsa iyzico işlem referansını belirtin. Tam kart numarası, CVC, şifre veya doğrulama kodu göndermeyin.",
    processingBody: "Onaylanan iadeler yalnızca ödemenin yapıldığı ödeme aracına gönderilir. Tutarın hesaba yansıma süresi, kartı veren banka veya ödeme kuruluşunun işlem süresine bağlıdır.",
    linksTitle: "İlgili belgeler ve destek",
    termsLink: "Kullanım Koşulları",
    distanceLink: "Mesafeli Hizmet Sözleşmesi",
    supportLink: "Müşteri Desteği",
  },
  en: {
    title: "Delivery and Returns",
    version: "Last updated: August 10, 2026",
    intro: "This policy explains delivery, cancellation and refund terms for digital subscriptions purchased through iyzico on the Logivya website.",
    storeScope: "Purchases made through the App Store or Google Play are subject to the payment, cancellation and refund rules of the relevant store. This page only covers payments made on the Logivya website.",
    deliveryTitle: "Delivery of the digital service",
    deliveryBody: "Logivya is a digital service; no physical product is shipped. A web subscription is assigned electronically to the user account after iyzico reports a successful payment and the required security checks are complete.",
    deliveryAccess: "Access is provided through the Logivya account used for the purchase. If the payment succeeds but the subscription is not activated, contact support from the email address registered to your account.",
    cancellationTitle: "Subscription cancellation",
    cancellationBody: "To stop the next renewal, submit a request through the in-app support center or email support@logivya.com from your registered address. Unless otherwise required, cancellation takes effect at the end of the current paid term and stops future charges.",
    withdrawalTitle: "Withdrawal right and refund review",
    withdrawalBody: "Where the customer consents to immediate delivery and performance of the digital service has begun, the withdrawal right may be limited under applicable legal exceptions. Mandatory consumer rights remain unaffected.",
    refundIntro: "A refund request may be reviewed in the following cases:",
    refundItems: [
      "The subscription cannot be activated for technical reasons after a successful charge.",
      "The same transaction is charged more than once.",
      "The purchased digital service cannot be delivered due to a cause attributable to Logivya.",
      "Other circumstances where applicable consumer law requires a refund.",
    ],
    requestTitle: "How to request a refund",
    requestBody: "Email support@logivya.com from the address registered to your account. Include the account holder's name, payment date, amount and the iyzico transaction reference if available. Never send a full card number, CVC, password or verification code.",
    processingBody: "Approved refunds are returned only to the original payment method. The time required for the amount to appear depends on the card issuer or payment institution.",
    linksTitle: "Related documents and support",
    termsLink: "Terms of Service",
    distanceLink: "Distance Service Agreement",
    supportLink: "Customer Support",
  },
} as const;

export default async function Page() {
  const locale = await getServerLocale();
  const copy = locale === "tr" ? deliveryAndReturnsCopy.tr : deliveryAndReturnsCopy.en;

  return (
    <LegalPage title={copy.title} versionLabel={copy.version}>
      <p>{copy.intro}</p>
      <p>{copy.storeScope}</p>

      <section aria-labelledby="delivery-heading">
        <h2 id="delivery-heading" className="text-xl font-semibold text-slate-950">{copy.deliveryTitle}</h2>
        <p className="mt-2">{copy.deliveryBody}</p>
        <p className="mt-2">{copy.deliveryAccess}</p>
      </section>

      <section aria-labelledby="cancellation-heading">
        <h2 id="cancellation-heading" className="text-xl font-semibold text-slate-950">{copy.cancellationTitle}</h2>
        <p className="mt-2">{copy.cancellationBody}</p>
      </section>

      <section aria-labelledby="refund-heading">
        <h2 id="refund-heading" className="text-xl font-semibold text-slate-950">{copy.withdrawalTitle}</h2>
        <p className="mt-2">{copy.withdrawalBody}</p>
        <p className="mt-2">{copy.refundIntro}</p>
        <ul className="mt-2 list-disc space-y-2 ps-5">
          {copy.refundItems.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section aria-labelledby="refund-request-heading">
        <h2 id="refund-request-heading" className="text-xl font-semibold text-slate-950">{copy.requestTitle}</h2>
        <p className="mt-2">{copy.requestBody}</p>
        <p className="mt-2">{copy.processingBody}</p>
      </section>

      <nav aria-labelledby="related-documents-heading" className="border-t border-slate-200 pt-5">
        <h2 id="related-documents-heading" className="text-xl font-semibold text-slate-950">{copy.linksTitle}</h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 font-semibold text-primary">
          <Link href="/terms-of-service">{copy.termsLink}</Link>
          <Link href="/distance-service-agreement">{copy.distanceLink}</Link>
          <Link href="/customer-support">{copy.supportLink}</Link>
        </div>
      </nav>
    </LegalPage>
  );
}
