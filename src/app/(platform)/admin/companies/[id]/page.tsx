import { notFound } from "next/navigation";

import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { t } = await getServerTranslator();
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id }, include: { owner: true, billingProfile: true, subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { members: true, accounts: true, campaigns: true, payments: true, invoices: true, supportTickets: true } }, internalNotes: { orderBy: { createdAt: "desc" }, take: 10 } } });
  if (!company) notFound();
  const cards = [[t("users.user"), company._count.members], [t("common.account"), company._count.accounts], [t("adminCampaigns.campaign"), company._count.campaigns], [t("adminPayments.title"), company._count.payments], [t("adminBilling.invoices"), company._count.invoices], [t("adminSupport.ticket"), company._count.supportTickets]] as const;
  const subscription = company.subscriptions[0];
  return <><h1 className="text-3xl font-semibold">{company.name}</h1><p className="mt-2 text-sm text-muted">{company.owner.email} · {t(`status.${company.securityStatus.toLowerCase()}`)}</p><div className="mt-6 grid gap-4 md:grid-cols-3">{cards.map(([label, count]) => <div key={label} className="panel rounded-2xl p-5"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{count}</p></div>)}</div><div className="panel mt-6 rounded-2xl p-6"><h2 className="font-semibold">{t("companyDetails.currentSubscription")}</h2><p className="mt-2 text-sm text-muted">{subscription?.plan.name || "-"} · {subscription?.status ? t(`status.${subscription.status.toLowerCase()}`) : "-"}</p><h2 className="mt-6 font-semibold">{t("adminSubscriptions.billingProfile")}</h2><p className="mt-2 text-sm text-muted">{company.billingProfile?.legalName || t("adminSubscriptions.incomplete")} · {company.billingProfile?.billingEmail || "-"}</p></div></>;
}
