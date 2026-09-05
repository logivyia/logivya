import {
  AdminCenter,
  AdminPagination,
  AdminTable,
} from "@/components/admin-center";
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
  await requirePlatformAdmin("admin.releases.read");
  const { locale, t } = await getServerTranslator();
  const requestedPage = normalizeAdminPage((await searchParams).page);
  const [releaseCount, blocked, failedChecks, artifacts] = await Promise.all([
    prisma.release.count(),
    prisma.release.count({ where: { status: "BLOCKED" } }),
    prisma.releaseCheck.count({
      where: { required: true, status: "FAILED" },
    }),
    prisma.releaseArtifact.count(),
  ]);
  const pages = adminPageCount(releaseCount);
  const page = Math.min(requestedPage, pages);
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      releaseId: true,
      platform: true,
      versionCode: true,
      versionName: true,
      status: true,
      gitCommit: true,
      channel: true,
      createdAt: true,
      _count: {
        select: {
          artifacts: true,
          checks: true,
          tests: true,
          approvals: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADMIN_TABLE_PAGE_SIZE,
    take: ADMIN_TABLE_PAGE_SIZE,
  });
  return (
    <AdminCenter
      eyebrow={t("adminReleases.eyebrow")}
      title={t("adminReleases.title")}
      description={t("adminReleases.description")}
      metrics={{
        [t("adminReleases.releases")]: releaseCount,
        [t("adminReleases.artifacts")]: artifacts,
        [t("adminReleases.blocked")]: blocked,
        [t("adminReleases.failedChecks")]: failedChecks,
      }}
    >
      <AdminTable
        emptyLabel={t("adminReleases.empty")}
        headers={[
          t("adminReleases.releaseId"),
          t("adminReleases.platform"),
          t("adminReleases.version"),
          t("common.status"),
          t("adminReleases.commit"),
          t("adminReleases.channel"),
          t("adminReleases.evidence"),
        ]}
        rows={releases.map((release) => [
          release.releaseId,
          readableEnum(release.platform, locale),
          `${release.versionCode ?? "-"} (${release.versionName})`,
          readableEnum(release.status, locale),
          release.gitCommit.slice(0, 12),
          release.channel ?? "-",
          `${release._count.artifacts} / ${release._count.checks} / ${release._count.tests} / ${release._count.approvals}`,
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

function readableEnum(value: string, locale: string) {
  return value
    .replaceAll("_", " ")
    .toLocaleLowerCase(locale)
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase(locale));
}
