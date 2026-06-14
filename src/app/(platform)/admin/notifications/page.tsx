import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerLocale } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

const notificationTypeLabels: Record<"tr" | "en", Record<string, string>> = {
  tr: {
    ACCOUNT_ARCHIVED: "Hesap arşivlendi",
    PAYMENT_RECEIVED: "Ödeme alındı",
    PAYMENT_REJECTED: "Ödeme reddedildi",
    SUPPORT_REPLY: "Destek yanıtı",
    SUBSCRIPTION_ACTIVATED: "Abonelik etkinleştirildi",
    SUBSCRIPTION_CANCELED: "Abonelik iptal edildi",
    SUBSCRIPTION_EXPIRED: "Abonelik süresi doldu",
    TRIAL_EXPIRED: "Deneme süresi doldu",
    TRIAL_STARTED: "Deneme başladı",
  },
  en: {
    ACCOUNT_ARCHIVED: "Account archived",
    PAYMENT_RECEIVED: "Payment received",
    PAYMENT_REJECTED: "Payment rejected",
    SUPPORT_REPLY: "Support reply",
    SUBSCRIPTION_ACTIVATED: "Subscription activated",
    SUBSCRIPTION_CANCELED: "Subscription canceled",
    SUBSCRIPTION_EXPIRED: "Subscription expired",
    TRIAL_EXPIRED: "Trial expired",
    TRIAL_STARTED: "Trial started",
  },
};

function notificationTypeLabel(type: string, locale: Locale) {
  const group = locale === "tr" ? "tr" : "en";
  return notificationTypeLabels[group][type] ?? (group === "tr" ? "Bildirim" : "Notification");
}

export default async function Page() {
  await requirePlatformAdmin("platform:read");
  const locale = await getServerLocale();
  const isTr = locale === "tr";
  const rows = await prisma.notification.findMany({
    include: { company: { select: { name: true } }, user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminCenter
      eyebrow={isTr ? "Operasyon Farkındalığı" : "Operational Awareness"}
      title={isTr ? "Yönetici Bildirimleri" : "Admin Notifications"}
      description={isTr ? "Kritik ödeme, sistem, güvenlik ve abonelik bildirimlerinin görünümü." : "A view of critical payment, system, security, and subscription notifications."}
      metrics={{
        [isTr ? "Gösterilen" : "Shown"]: rows.length,
        [isTr ? "Okunmamış" : "Unread"]: rows.filter((x) => !x.isRead).length,
        [isTr ? "Güvenlik" : "Security"]: rows.filter((x) => x.type.includes("SECURITY")).length,
        [isTr ? "Faturalandırma" : "Billing"]: rows.filter((x) => x.type.includes("PAYMENT") || x.type.includes("INVOICE")).length,
      }}
    >
      <AdminTable
        headers={[isTr ? "Tür" : "Type", isTr ? "Başlık" : "Title", isTr ? "Şirket" : "Company", isTr ? "Kullanıcı" : "User", isTr ? "Okundu" : "Read", isTr ? "Tarih" : "Date"]}
        rows={rows.map((x) => [
          notificationTypeLabel(x.type, locale),
          x.title,
          x.company.name,
          x.user.email,
          x.isRead ? (isTr ? "Evet" : "Yes") : isTr ? "Hayır" : "No",
          x.createdAt.toLocaleString(isTr ? "tr-TR" : "en-US"),
        ])}
      />
    </AdminCenter>
  );
}
