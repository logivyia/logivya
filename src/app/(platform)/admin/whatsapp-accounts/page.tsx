import Link from "next/link";
import type { Prisma } from "@prisma/client";
import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
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
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  await requirePlatformAdmin("admin.whatsapp.read");
  const { locale, t } = await getServerTranslator();
  const params = await searchParams;
  const requestedPage = normalizeAdminPage(params.page);
  const status = ["CONNECTED", "DISCONNECTED", "RECONNECT_REQUIRED", "CONNECTING", "ERROR", "FAILED", "RISK"].includes(params.status ?? "") ? params.status! : "";
  const query = params.q?.trim() ?? "";
  const visibleWhere: Prisma.WhatsAppAccountWhereInput = { archivedAt: null };
  const filteredWhere: Prisma.WhatsAppAccountWhereInput = { ...visibleWhere,
    ...(status === "RISK" ? { status: { in: ["ERROR", "RECONNECT_REQUIRED"] } } : status ? { status: status as never } : {}),
    ...(query ? { OR: [{ label: { contains: query, mode: "insensitive" } }, { company: { name: { contains: query, mode: "insensitive" } } }] } : {}),
  };
  const [total, connected, disconnected, atRisk] = await Promise.all([
    prisma.whatsAppAccount.count({ where: visibleWhere }),
    prisma.whatsAppAccount.count({
      where: { ...visibleWhere, status: "CONNECTED" },
    }),
    prisma.whatsAppAccount.count({
      where: { ...visibleWhere, status: "DISCONNECTED" },
    }),
    prisma.whatsAppAccount.count({
      where: {
        ...visibleWhere,
        status: { in: ["ERROR", "RECONNECT_REQUIRED"] },
      },
    }),
  ]);
  const filteredTotal = await prisma.whatsAppAccount.count({ where: filteredWhere });
  const pages = adminPageCount(filteredTotal);
  const page = Math.min(requestedPage, pages);
  const rows = await prisma.whatsAppAccount.findMany({
    where: filteredWhere,
    include: { company: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });

  return (
    <AdminCenter
      eyebrow={t("adminWhatsApp.eyebrow")}
      title={t("adminWhatsApp.title")}
      description={t("adminWhatsApp.description")}
      metricLinks={{
        [locale === "tr" ? "Toplam hesap" : "Total accounts"]: "/admin/whatsapp-accounts#admin-records",
        [t("adminWhatsApp.connected")]: "/admin/whatsapp-accounts?status=CONNECTED#admin-records",
        [t("adminWhatsApp.disconnected")]: "/admin/whatsapp-accounts?status=DISCONNECTED#admin-records",
        [t("adminWhatsApp.atRisk")]: "/admin/whatsapp-accounts?status=RISK#admin-records",
      }}
      metrics={{
        [locale === "tr" ? "Toplam hesap" : "Total accounts"]: total,
        [t("adminWhatsApp.connected")]: connected,
        [t("adminWhatsApp.disconnected")]: disconnected,
        [t("adminWhatsApp.atRisk")]: atRisk,
      }}
    >
      <form className="mb-4 flex flex-wrap gap-2"><input name="q" defaultValue={query} placeholder={locale === "tr" ? "Hesap veya çalışma alanı ara" : "Search account or workspace"} aria-label={locale === "tr" ? "Hesap veya çalışma alanı ara" : "Search account or workspace"} className="min-h-11 min-w-0 flex-1 rounded-xl border px-3" /><select name="status" defaultValue={status} aria-label={t("common.status")} className="min-h-11 rounded-xl border px-3">{["", "CONNECTED", "DISCONNECTED", "RECONNECT_REQUIRED", "CONNECTING", "ERROR", "FAILED", "RISK"].map(value => <option key={value} value={value}>{value === "RISK" ? t("adminWhatsApp.atRisk") : value ? statusLabel(t, "whatsapp", value) : locale === "tr" ? "Tümü" : "All"}</option>)}</select><button className="min-h-11 rounded-xl bg-orange-600 px-5 font-semibold text-white">{locale === "tr" ? "Ara" : "Search"}</button>{status || query ? <Link className="grid min-h-11 place-items-center rounded-xl border px-3" href="/admin/whatsapp-accounts">{locale === "tr" ? "Temizle" : "Clear"}</Link> : null}</form>
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("common.account"),
          t("common.company"),
          t("common.status"),
          t("accounts.lastSync"),
        ]}
        rows={rows.map((x) => [
          x.label,
          x.company.name,
          statusLabel(t, "whatsapp", x.status),
          x.lastSyncedAt ? formatDateTime(x.lastSyncedAt, locale) : "-",
        ])}
      />
      <AdminPagination
        query={{ status, q: query }}
        page={page}
        pages={pages}
        previousLabel={locale === "tr" ? "Önceki" : "Previous"}
        nextLabel={locale === "tr" ? "Sonraki" : "Next"}
        pageLabel={locale === "tr" ? "Sayfa" : "Page"}
      />
    </AdminCenter>
  );
}
