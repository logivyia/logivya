import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
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
  await requirePlatformAdmin("admin.privacy.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [total, pending, completed, deletions] = await Promise.all([
    prisma.dataSubjectRequest.count(),
    prisma.dataSubjectRequest.count({
      where: {
        status: { notIn: ["COMPLETED", "REJECTED", "CANCELED", "CLOSED"] },
      },
    }),
    prisma.dataSubjectRequest.count({ where: { status: "COMPLETED" } }),
    prisma.dataSubjectRequest.count({ where: { type: "DELETION" } }),
  ]);
  const pages = adminPageCount(total);
  const page = Math.min(requestedPage, pages);
  const rows = await prisma.dataSubjectRequest.findMany({
    include: {
      company: { select: { name: true } },
      user: { select: { email: true } },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });
  return (
    <AdminCenter
      eyebrow={t("adminData.eyebrow")}
      title={t("adminData.title")}
      description={t("adminData.description")}
      metrics={{
        [t("adminData.total")]: total,
        [t("adminData.pending")]: pending,
        [t("adminData.completed")]: completed,
        [t("adminData.deletion")]: deletions,
      }}
    >
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("adminNotifications.type"),
          t("common.status"),
          t("common.company"),
          t("users.user"),
          t("adminData.requestDate"),
        ]}
        rows={rows.map((row) => [
          t(`dataRequest.type.${row.type.toLowerCase()}`),
          dataRequestStatusLabel(t, row.status),
          row.company?.name,
          row.user?.email,
          formatDateTime(row.requestedAt, locale),
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

function dataRequestStatusLabel(t: (key: string) => string, status: string) {
  const keys: Record<string, string> = {
    REQUESTED: "dataRequest.status.requested",
    RECEIVED: "dataRequest.status.requested",
    VERIFYING: "dataRequest.status.verifying",
    IDENTITY_VERIFICATION_REQUIRED: "dataRequest.status.verifying",
    IN_REVIEW: "dataRequest.status.processing",
    WAITING_FOR_USER: "status.waiting_for_user",
    PROCESSING: "dataRequest.status.processing",
    APPROVED: "dataRequest.status.processing",
    PARTIALLY_APPROVED: "dataRequest.status.processing",
    COMPLETED: "dataRequest.status.completed",
    REJECTED: "dataRequest.status.rejected",
    CANCELED: "status.canceled",
    CLOSED: "status.closed",
  };
  return t(keys[status] ?? "status.unknown");
}
