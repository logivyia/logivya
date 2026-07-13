/* eslint-disable react-hooks/purity */
import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("security:read");
  const { locale, t } = await getServerTranslator();
  const [events, failed, critical, open] = await Promise.all([prisma.securityEvent.findMany({ include: { company: { select: { name: true } }, user: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }), prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }), prisma.securityEvent.count({ where: { severity: "CRITICAL", resolvedAt: null } }), prisma.securityEvent.count({ where: { resolvedAt: null } })]);
  return <AdminCenter eyebrow={t("adminSecurity.eyebrow")} title={t("adminSecurity.title")} description={t("adminSecurity.description")} metrics={{ [t("adminSecurity.openEvents")]: open, [t("adminSecurity.criticalEvents")]: critical, [t("adminSecurity.failedLogins")]: failed, [t("adminSecurity.riskScore")]: Math.max(0, 100 - critical * 15) }}><AdminTable emptyLabel={t("admin.list.empty")} headers={[t("adminSecurity.severity"), t("adminNotifications.type"), t("adminSecurity.message"), t("common.company"), t("users.user"), t("admin.list.date")]} rows={events.map((event) => [t(`security.severity.${event.severity.toLowerCase()}`), t(`security.event.${event.type}`), t(`security.eventMessage.${event.type}`), event.company?.name, event.user?.email, formatDateTime(event.createdAt, locale)])}/></AdminCenter>;
}
