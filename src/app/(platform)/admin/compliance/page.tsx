import { AdminCenter, AdminTable } from "@/components/admin-center";
import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("compliance:read");
  const { locale, t } = await getServerTranslator();
  const [consents, requests, pending, deletions] = await Promise.all([prisma.consentRecord.findMany({ include: { user: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }), prisma.dataSubjectRequest.count(), prisma.dataSubjectRequest.count({ where: { status: { in: ["REQUESTED", "VERIFYING", "PROCESSING"] } } }), prisma.dataSubjectRequest.count({ where: { type: "DELETION" } })]);
  return <AdminCenter eyebrow={t("adminCompliance.eyebrow")} title={t("adminCompliance.title")} description={t("adminCompliance.description")} metrics={{ [t("adminCompliance.consentRecords")]: consents.length, [t("adminCompliance.dataRequests")]: requests, [t("adminCompliance.pendingRequests")]: pending, [t("adminCompliance.deletionRequests")]: deletions }}><AdminTable emptyLabel={t("admin.list.empty")} headers={[t("users.user"), t("adminCompliance.consent"), t("adminCompliance.version"), t("adminCompliance.decision"), t("admin.list.date")]} rows={consents.map((consent) => [consent.user.email, t(`consent.type.${consent.type.toLowerCase()}`), consent.version, consent.granted ? t("adminCompliance.accepted") : t("adminCompliance.rejected"), formatDateTime(consent.createdAt, locale)])}/></AdminCenter>;
}
