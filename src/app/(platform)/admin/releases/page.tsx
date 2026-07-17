import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("admin.dashboard.read");
  const { t } = await getServerTranslator();
  const [releases, blocked, failedChecks, artifacts] = await Promise.all([
    prisma.release.findMany({
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
        _count: { select: { artifacts: true, checks: true, tests: true, approvals: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    prisma.release.count({ where: { status: "BLOCKED" } }),
    prisma.releaseCheck.count({ where: { required: true, status: "FAILED" } }),
    prisma.releaseArtifact.count(),
  ]);
  return (
    <AdminCenter
      eyebrow={t("adminReleases.eyebrow")}
      title={t("adminReleases.title")}
      description={t("adminReleases.description")}
      metrics={{
        [t("adminReleases.releases")]: releases.length,
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
          release.platform,
          `${release.versionCode ?? "-"} (${release.versionName})`,
          release.status,
          release.gitCommit.slice(0, 12),
          release.channel ?? "-",
          `${release._count.artifacts} / ${release._count.checks} / ${release._count.tests} / ${release._count.approvals}`,
        ])}
      />
    </AdminCenter>
  );
}
