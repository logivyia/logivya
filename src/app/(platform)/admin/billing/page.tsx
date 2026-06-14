import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerLocale } from "@/i18n/server";
import { getPaymentStatusLabel } from "@/lib/i18n/status-labels";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("billing:read");
  const locale = await getServerLocale();
  const isTr = locale === "tr";
  const [payments, invoices, active, failed] = await Promise.all([
    prisma.payment.findMany({ include: { company: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.invoice.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.payment.count({ where: { status: "FAILED" } }),
  ]);
  const revenue = payments.filter((x) => ["PAID", "SUCCEEDED"].includes(x.status)).reduce((n, x) => n + Number(x.amount), 0);

  return (
    <AdminCenter
      eyebrow={isTr ? "Gelir Operasyonları" : "Revenue Operations"}
      title={isTr ? "Faturalandırma Operasyon Merkezi" : "Billing Operations Center"}
      description={isTr ? "Abonelik, ödeme, fatura ve gelir operasyonlarının merkezi görünümü." : "A central view of subscription, payment, invoice, and revenue operations."}
      metrics={{
        [isTr ? "Toplam gelir" : "Total revenue"]: `${revenue.toLocaleString(isTr ? "tr-TR" : "en-US")} TRY`,
        [isTr ? "Aktif abonelik" : "Active subscriptions"]: active,
        [isTr ? "Fatura" : "Invoices"]: invoices,
        [isTr ? "Başarısız ödeme" : "Failed payments"]: failed,
      }}
    >
      <AdminTable
        headers={[isTr ? "Şirket" : "Company", isTr ? "Durum" : "Status", isTr ? "Yöntem" : "Method", isTr ? "Tutar" : "Amount", isTr ? "Tarih" : "Date"]}
        rows={payments.map((x) => [
          x.company.name,
          getPaymentStatusLabel(x.status, locale),
          x.paymentMethod,
          `${x.amount} ${x.currency}`,
          x.createdAt.toLocaleString(isTr ? "tr-TR" : "en-US"),
        ])}
      />
    </AdminCenter>
  );
}
