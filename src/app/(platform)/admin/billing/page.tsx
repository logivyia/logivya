import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
import { formatCurrency, formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { statusLabel } from "@/i18n/status";
import {
  ADMIN_TABLE_PAGE_SIZE,
  adminPageCount,
  normalizeAdminPage,
} from "@/server/admin/pagination";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePlatformAdmin("admin.billing.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [revenueByCurrency, invoices, active, failed, paymentCount] =
    await Promise.all([
      prisma.payment.groupBy({
        by: ["currency"],
        where: {
          status: { in: ["PAID", "SUCCEEDED", "MANUALLY_CONFIRMED"] },
        },
        _sum: { amount: true },
        orderBy: { currency: "asc" },
      }),
      prisma.invoice.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.payment.count({ where: { status: "FAILED" } }),
      prisma.payment.count(),
    ]);
  const pages = adminPageCount(paymentCount);
  const page = Math.min(requestedPage, pages);
  const payments = await prisma.payment.findMany({
    include: { company: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });
  const revenueMetrics = Object.fromEntries(
    revenueByCurrency.map((entry) => [
      `${t("adminBilling.totalRevenue")} · ${entry.currency}`,
      formatCurrency(Number(entry._sum.amount ?? 0), entry.currency, locale),
    ]),
  );

  return (
    <AdminCenter
      eyebrow={t("adminBilling.eyebrow")}
      title={t("adminBilling.title")}
      description={t("adminBilling.description")}
      metricLinks={{
        ...Object.fromEntries(Object.keys(revenueMetrics).map(label => [label, "/admin/payments"])),
        [t("adminBilling.activeSubscriptions")]: "/admin/subscriptions?status=ACTIVE",
        [t("adminBilling.invoices")]: "/admin/invoices",
        [t("adminBilling.failedPayments")]: "/admin/payments?status=FAILED",
      }}
      metrics={{
        ...revenueMetrics,
        [t("adminBilling.activeSubscriptions")]: active,
        [t("adminBilling.invoices")]: invoices,
        [t("adminBilling.failedPayments")]: failed,
      }}
    >
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("common.company"),
          t("common.status"),
          t("adminBilling.method"),
          t("adminPayments.amount"),
          t("admin.list.date"),
        ]}
        rows={payments.map((payment) => [
          payment.company.name,
          statusLabel(t, "payment", payment.status),
          paymentMethodLabel(t, payment.paymentMethod),
          formatCurrency(Number(payment.amount), payment.currency, locale),
          formatDateTime(payment.createdAt, locale),
        ])}
      />
      <AdminPagination
        page={page}
        pages={pages}
        previousLabel={locale === "tr" ? "Önceki" : "Previous"}
        nextLabel={locale === "tr" ? "Sonraki" : "Next"}
        pageLabel={locale === "tr" ? "Sayfa" : "Page"}
      />
    </AdminCenter>
  );
}

function paymentMethodLabel(t: (key: string) => string, method: string) {
  if (method === "APPLE_IN_APP_PURCHASE") return "Apple App Store";
  if (method === "GOOGLE_PLAY_BILLING") return "Google Play";
  if (method === "CREDIT_CARD") return t("billing.iyzico.secureProvider");
  return t(`billing.paymentMethod.${method.toLowerCase()}`);
}
