import { AdminCenter, AdminTable } from "@/components/admin-center";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin("operations:read");
  const { t } = await getServerTranslator();
  const [endpoints, failed, dead] = await Promise.all([prisma.webhookEndpoint.findMany({ include: { company: { select: { name: true } }, deliveries: { orderBy: { createdAt: "desc" }, take: 1 } }, take: 100 }), prisma.webhookDelivery.count({ where: { status: "FAILED" } }), prisma.webhookDelivery.count({ where: { status: "DEAD_LETTER" } })]);
  return <AdminCenter eyebrow={t("adminWebhooks.eyebrow")} title={t("adminWebhooks.title")} description={t("adminWebhooks.description")} metrics={{ [t("adminWebhooks.endpoints")]: endpoints.length, [t("status.active")]: endpoints.filter((endpoint) => endpoint.isActive).length, [t("status.failed")]: failed, [t("adminWebhooks.deadLetter")]: dead }}><AdminTable emptyLabel={t("admin.list.empty")} headers={[t("common.company"), "URL", t("status.active"), t("adminWebhooks.events"), t("adminWebhooks.lastDelivery")]} rows={endpoints.map((endpoint) => [endpoint.company.name, new URL(endpoint.url).origin, endpoint.isActive ? t("common.yes") : t("common.no"), endpoint.events.length, endpoint.deliveries[0]?.status ? t(`webhook.status.${endpoint.deliveries[0].status.toLowerCase()}`) : "-"])}/></AdminCenter>;
}
