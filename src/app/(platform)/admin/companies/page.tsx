import Link from "next/link";

import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  await requirePlatformAdmin();
  const { t } = await getServerTranslator();
  const companies = await prisma.company.findMany({
    include: {
      owner: { select: { email: true } },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { members: true, accounts: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("adminCompanies.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("adminCompanies.title")}</h1></header>
      <div className="panel overflow-x-auto rounded-2xl p-5">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-3">{t("common.company")}</th><th>{t("adminSubscriptions.plan")}</th><th>{t("users.user")}</th><th>WhatsApp</th><th>{t("common.status")}</th></tr></thead>
          <tbody>{companies.map((company) => <tr key={company.id} className="border-b last:border-0"><td className="py-4"><Link className="font-semibold text-primary" href={`/admin/companies/${company.id}`}>{company.name}</Link><p className="text-xs text-muted">{company.owner.email}</p></td><td>{company.subscriptions[0]?.plan.name || "-"}</td><td>{company._count.members}</td><td>{company._count.accounts}</td><td>{t(`status.${company.securityStatus.toLowerCase()}`)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
