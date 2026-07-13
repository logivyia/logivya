import { AdminCenter, AdminTable } from "@/components/admin-center";
import { localeMetadata, normalizeLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("users:manage");
  const { locale, t } = await getServerTranslator();
  const [users, active, sessions, admins] = await Promise.all([
    prisma.user.findMany({
      select: {
        name: true,
        email: true,
        status: true,
        locale: true,
        timezone: true,
        memberships: { select: { company: { select: { name: true } } }, take: 1 },
        sessions: { where: { revokedAt: null }, orderBy: { lastActiveAt: "desc" }, take: 1, select: { lastActiveAt: true } },
        platformAdmin: { select: { role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.userSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.platformAdmin.count({ where: { isActive: true, role: "SUPER_ADMIN" } }),
  ]);

  return (
    <AdminCenter
      eyebrow={t("adminUsers.eyebrow")}
      title={t("adminUsers.title")}
      description={t("adminUsers.description")}
      metrics={{
        [t("adminUsers.totalUsers")]: users.length,
        [t("adminUsers.activeUsers")]: active,
        [t("adminUsers.activeSessions")]: sessions,
        [t("adminUsers.superAdmin")]: admins,
      }}
    >
      <AdminTable
        headers={[t("users.user"), t("common.company"), t("common.status"), t("adminUsers.languageTimezone"), t("adminUsers.lastActiveSession"), t("adminUsers.adminRole")]}
        rows={users.map((user) => [
          `${user.name} · ${user.email}`,
          user.memberships[0]?.company.name,
          t(`users.${user.status === "INVITED" ? "invitedStatus" : user.status.toLowerCase()}`),
          `${localeMetadata[normalizeLocale(user.locale) ?? "en"].nativeName} · ${user.timezone}`,
          user.sessions[0]?.lastActiveAt ? formatDateTime(user.sessions[0].lastActiveAt, locale) : "-",
          user.platformAdmin?.role === "SUPER_ADMIN" ? t("adminUsers.superAdmin") : user.platformAdmin?.role ? t(`adminUsers.role.${user.platformAdmin.role.toLowerCase()}`) : "-",
        ])}
      />
    </AdminCenter>
  );
}
