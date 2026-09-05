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
  await requirePlatformAdmin("admin.audit.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [consentCount, requests, pending, deletions] = await Promise.all([
    prisma.consentRecord.count(),
    prisma.dataSubjectRequest.count(),
    prisma.dataSubjectRequest.count({
      where: {
        status: { notIn: ["COMPLETED", "REJECTED", "CANCELED", "CLOSED"] },
      },
    }),
    prisma.dataSubjectRequest.count({ where: { type: "DELETION" } }),
  ]);
  const pages = adminPageCount(consentCount);
  const page = Math.min(requestedPage, pages);
  const consents = await prisma.consentRecord.findMany({
    include: { user: { select: { email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });
  return (
    <AdminCenter
      eyebrow={t("adminCompliance.eyebrow")}
      title={t("adminCompliance.title")}
      description={t("adminCompliance.description")}
      metrics={{
        [t("adminCompliance.consentRecords")]: consentCount,
        [t("adminCompliance.dataRequests")]: requests,
        [t("adminCompliance.pendingRequests")]: pending,
        [t("adminCompliance.deletionRequests")]: deletions,
      }}
    >
      <AdminTable
        emptyLabel={t("admin.list.empty")}
        headers={[
          t("users.user"),
          t("adminCompliance.consent"),
          t("adminCompliance.version"),
          t("adminCompliance.decision"),
          t("admin.list.date"),
        ]}
        rows={consents.map((consent) => [
          consent.user.email,
          consentTypeLabel(t, consent.type),
          consent.version,
          consent.granted
            ? t("adminCompliance.accepted")
            : t("adminCompliance.rejected"),
          formatDateTime(consent.createdAt, locale),
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

function consentTypeLabel(t: (key: string) => string, type: string) {
  const keys: Record<string, string> = {
    TERMS_OF_SERVICE: "terms",
    PRIVACY_POLICY: "privacy",
    KVKK: "kvkk",
    MARKETING: "marketing",
  };
  const key = keys[type];
  return key ? t(`consent.type.${key}`) : t("status.unknown");
}
