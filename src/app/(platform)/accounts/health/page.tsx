import { formatDateTime } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function Page() {
  const { company, user } = await requireSession();
  const { locale, t } = await getServerTranslator();
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { companyId: company.id, userId: user.id, archivedAt: null },
    include: { _count: { select: { groups: true, recipients: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <h1 className="text-3xl font-semibold">{t("accountHealth.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("accountHealth.description")}</p>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {accounts.map((account) => (
          <article key={account.id} className="panel rounded-2xl p-5">
            <div className="flex justify-between">
              <b>{account.label}</b>
              <span className="rounded-full bg-primary-soft px-2 py-1 text-xs text-primary">{t(`accountStatus.${account.status}`)}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <p>{t("common.groups")}: {account._count.groups}</p>
              <p>{t("adminWhatsApp.deliveries")}: {account._count.recipients}</p>
              <p>{t("accountHealth.lastConnection")}: {account.lastConnectedAt ? formatDateTime(account.lastConnectedAt, locale) : "-"}</p>
              <p>{t("accounts.lastSync")}: {account.lastSyncedAt ? formatDateTime(account.lastSyncedAt, locale) : "-"}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
