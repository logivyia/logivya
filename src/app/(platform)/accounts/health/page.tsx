import { getServerLocale } from "@/i18n/server";
import { getWhatsAppStatusLabel } from "@/lib/i18n/status-labels";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export default async function Page() {
  const { company } = await requireSession();
  const locale = await getServerLocale();
  const isTr = locale === "tr";
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { companyId: company.id, archivedAt: null },
    include: { _count: { select: { groups: true, recipients: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <h1 className="text-3xl font-semibold">{isTr ? "WhatsApp Sağlık Merkezi" : "WhatsApp Health Center"}</h1>
      <p className="mt-2 text-sm text-muted">{isTr ? "Bağlantı, senkronizasyon ve gönderim sağlığını izleyin." : "Monitor connection, synchronization, and delivery health."}</p>
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {accounts.map((account) => (
          <article key={account.id} className="panel rounded-2xl p-5">
            <div className="flex justify-between">
              <b>{account.label}</b>
              <span className="rounded-full bg-primary-soft px-2 py-1 text-xs text-primary">{getWhatsAppStatusLabel(account.status, locale)}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <p>{isTr ? "Gruplar" : "Groups"}: {account._count.groups}</p>
              <p>{isTr ? "Gönderimler" : "Deliveries"}: {account._count.recipients}</p>
              <p>{isTr ? "Son bağlantı" : "Last connection"}: {account.lastConnectedAt?.toLocaleString(isTr ? "tr-TR" : "en-US") || "-"}</p>
              <p>{isTr ? "Son eşitleme" : "Last sync"}: {account.lastSyncedAt?.toLocaleString(isTr ? "tr-TR" : "en-US") || "-"}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
