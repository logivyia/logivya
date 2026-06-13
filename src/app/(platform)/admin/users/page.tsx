import { AdminCenter, AdminTable } from "@/components/admin-center";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("users:manage");
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
  return <AdminCenter eyebrow="Identity Governance" title="User Management Center" description="Kullanıcı, oturum, cihaz ve yönetici rollerini gizlilik odaklı yönetin." metrics={{ "Toplam kullanıcı": users.length, "Aktif kullanıcı": active, "Aktif oturum": sessions, "Super Admin": admins }}>
    <AdminTable headers={["Kullanıcı", "Şirket", "Durum", "Dil / timezone", "Son aktif oturum", "Admin rolü"]} rows={users.map((user) => [`${user.name} · ${user.email}`, user.memberships[0]?.company.name, user.status, `${user.locale} · ${user.timezone}`, user.sessions[0]?.lastActiveAt.toLocaleString(), user.platformAdmin?.role])} />
  </AdminCenter>;
}
