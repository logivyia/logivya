import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerLocale } from "@/i18n/server";
import type { Locale } from "@/i18n/config";
import { getAdminMenuLabel } from "@/lib/i18n/status-labels";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

function userStatusLabel(status: string, locale: Locale) {
  const isTr = locale === "tr";
  const labels: Record<string, string> = isTr
    ? { ACTIVE: "Aktif", INVITED: "Davet Edildi", SUSPENDED: "Askıya Alındı", DELETED: "Silindi" }
    : { ACTIVE: "Active", INVITED: "Invited", SUSPENDED: "Suspended", DELETED: "Deleted" };
  return labels[status] ?? (isTr ? "Bilinmiyor" : "Unknown");
}

export default async function Page() {
  await requirePlatformAdmin("users:manage");
  const locale = await getServerLocale();
  const isTr = locale === "tr";
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
      eyebrow={isTr ? "Kimlik Yönetimi" : "Identity Governance"}
      title={isTr ? "Kullanıcı Yönetim Merkezi" : "User Management Center"}
      description={isTr ? "Kullanıcı, oturum, cihaz ve yönetici rollerini gizlilik odaklı yönetin." : "Manage users, sessions, devices, and admin roles with privacy in mind."}
      metrics={{
        [isTr ? "Toplam kullanıcı" : "Total users"]: users.length,
        [isTr ? "Aktif kullanıcı" : "Active users"]: active,
        [isTr ? "Aktif oturum" : "Active sessions"]: sessions,
        [getAdminMenuLabel("superAdmin", locale)]: admins,
      }}
    >
      <AdminTable
        headers={[isTr ? "Kullanıcı" : "User", isTr ? "Şirket" : "Company", isTr ? "Durum" : "Status", isTr ? "Dil / zaman dilimi" : "Language / timezone", isTr ? "Son aktif oturum" : "Last active session", isTr ? "Yönetici rolü" : "Admin role"]}
        rows={users.map((user) => [
          `${user.name} · ${user.email}`,
          user.memberships[0]?.company.name,
          userStatusLabel(user.status, locale),
          `${user.locale} · ${user.timezone}`,
          user.sessions[0]?.lastActiveAt.toLocaleString(isTr ? "tr-TR" : "en-US"),
          user.platformAdmin?.role === "SUPER_ADMIN" ? getAdminMenuLabel("superAdmin", locale) : user.platformAdmin?.role,
        ])}
      />
    </AdminCenter>
  );
}
