import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatCurrency, formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("billing:read");
  const { locale, t } = await getServerTranslator();
  const [payments, invoices, active, failed] = await Promise.all([
    prisma.payment.findMany({ include: { company: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.invoice.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.payment.count({ where: { status: "FAILED" } }),
  ]);
  const revenue = payments.filter((x) => ["PAID", "SUCCEEDED"].includes(x.status)).reduce((n, x) => n + Number(x.amount), 0);

  return (
    <AdminCenter
      eyebrow={t("adminBilling.eyebrow")}
      title={t("adminBilling.title")}
      description={t("adminBilling.description")}
      metrics={{
        [t("adminBilling.totalRevenue")]: formatCurrency(revenue, "TRY", locale),
        [t("adminBilling.activeSubscriptions")]: active,
        [t("adminBilling.invoices")]: invoices,
        [t("adminBilling.failedPayments")]: failed,
      }}
    >
      <AdminTable
        headers={[t("common.company"), t("common.status"), t("adminBilling.method"), t("adminPayments.amount"), t("admin.list.date")]}
        rows={payments.map((x) => [
          x.company.name,
          t(`payment.status.${x.status.toLowerCase()}`),
          t(`billing.paymentMethod.${x.paymentMethod.toLowerCase()}`),
          formatCurrency(Number(x.amount), x.currency, locale),
          formatDateTime(x.createdAt, locale),
        ])}
      />
    </AdminCenter>
  );
}
