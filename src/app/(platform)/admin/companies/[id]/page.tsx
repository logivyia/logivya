import { notFound } from "next/navigation";

import { formatDateTime, formatNumber } from "@/i18n/format";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { resolveAdminSeatIntegrity } from "@/server/billing/admin-seat-integrity";
import { isCompanySubscriptionActive } from "@/server/billing/company-entitlements";
import { prisma } from "@/server/db";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { locale, t } = await getServerTranslator();
  const { id } = await params;
  const now = new Date();
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true } },
      billingProfile: true,
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 20 },
      trialEntitlements: { orderBy: { createdAt: "asc" }, take: 1 },
      members: {
        include: { user: { select: { name: true, email: true, phone: true, status: true } } },
        orderBy: { createdAt: "asc" },
      },
      invitations: {
        where: { status: "PENDING", expiresAt: { gt: now } },
        select: { id: true, name: true, email: true, role: true, reservedSeat: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      subscriptionAuditLogs: {
        include: { actorUser: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: { select: { accounts: true, payments: true, invoices: true, supportTickets: true } },
    },
  });
  if (!company) notFound();

  const activeSubscription = company.subscriptions.find((subscription) => isCompanySubscriptionActive(subscription));
  const latestSubscription = activeSubscription ?? company.subscriptions[0];
  const ownerMembership = company.members.find((membership) => (
    membership.userId === company.ownerId
    && membership.role === "OWNER"
    && membership.status === "ACTIVE"
    && membership.lifecycleState === "INDEPENDENT_OWNER"
  ));
  const activeMembers = company.members.filter((membership) => membership.status === "ACTIVE").length;
  const suspendedMembers = company.members.filter((membership) => membership.status === "SUSPENDED").length;
  const invitedMembers = company.members.filter((membership) => membership.status === "INVITED").length;
  const reservedInvitations = company.invitations.filter((invitation) => invitation.reservedSeat).length;
  const trial = company.trialEntitlements[0];
  const seatIntegrity = resolveAdminSeatIntegrity({
    companyName: company.name,
    ownerEmail: company.owner.email,
    hasOwnerMembership: Boolean(ownerMembership),
    hasActiveSubscription: Boolean(activeSubscription),
    hasAnySubscription: company.subscriptions.length > 0,
    activePlanSlug: activeSubscription?.plan.slug,
    activePlanMaxTeamUsers: activeSubscription?.plan.maxTeamUsers,
    trialEntitlementStatus: trial?.status,
    activeMembers,
    suspendedMembers,
    invitedMembers,
    pendingInvitations: reservedInvitations,
  });

  const facts = [
    [t("users.user"), company.owner.name],
    [t("auth.email"), company.owner.email],
    [t("company.phone"), company.owner.phone || company.phone || "-"],
    [t("common.company"), company.name],
    [t("common.status"), `${company.securityStatus} / ${company.owner.status}`],
    [t("adminSubscriptions.plan"), activeSubscription?.plan.name || t("adminSubscriptions.noActivePackage")],
    [t("adminSubscriptions.seats"), `${formatNumber(seatIntegrity.used, locale)} / ${formatNumber(seatIntegrity.limit, locale)}`],
    [t("adminSubscriptions.start"), displayDate(latestSubscription?.startsAt ?? latestSubscription?.trialStartsAt, locale)],
    [t("adminSubscriptions.end"), displayDate(latestSubscription?.currentPeriodEndsAt ?? latestSubscription?.endsAt ?? latestSubscription?.trialEndsAt, locale)],
    [t("adminSubscriptions.trialAccounts"), trial ? `${trial.status}${trial.decisionCode ? ` / ${trial.decisionCode}` : ""}` : "-"],
  ] as const;

  return <div className="space-y-6">
    <header>
      <h1 className="text-3xl font-semibold">{company.name}</h1>
      <p className="mt-2 text-sm text-muted">{company.owner.email} · {company.id}</p>
    </header>

    <section className="rounded-lg border bg-white p-5">
      <h2 className="font-semibold">{t("companyDetails.currentSubscription")}</h2>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {facts.map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}
      </dl>
      {seatIntegrity.configurationRequired || seatIntegrity.reconciliationRequired ? <p className={`mt-4 text-sm font-semibold ${seatIntegrity.reconciliationRequired ? "text-red-600" : "text-amber-700"}`}>{t(seatIntegrity.reconciliationRequired ? "adminSubscriptions.reconciliationRequired" : "adminSubscriptions.configurationRequired")}</p> : null}
    </section>

    <section className="rounded-lg border bg-white p-5">
      <h2 className="font-semibold">{t("users.invitationCardTitle")}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b text-xs text-muted"><th className="py-3 pr-4">{t("users.user")}</th><th className="pr-4">{t("auth.email")}</th><th className="pr-4">{t("users.role")}</th><th>{t("adminSubscriptions.end")}</th></tr></thead>
          <tbody>{company.invitations.length ? company.invitations.map((invitation) => <tr key={invitation.id} className="border-b last:border-0"><td className="py-3 pr-4">{invitation.name}</td><td className="pr-4">{invitation.email}</td><td className="pr-4">{invitation.role}</td><td>{displayDate(invitation.expiresAt, locale)}</td></tr>) : <tr><td colSpan={4} className="py-4 text-muted">-</td></tr>}</tbody>
        </table>
      </div>
    </section>

    <section className="rounded-lg border bg-white p-5">
      <h2 className="font-semibold">{t("admin.menu.audit")}</h2>
      <div className="mt-4 divide-y">
        {company.subscriptionAuditLogs.length ? company.subscriptionAuditLogs.map((audit) => <div key={audit.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto] sm:gap-4"><div><b>{audit.eventType}</b><p className="mt-1 text-xs text-muted">{audit.actorUser?.name || audit.actorUser?.email || "SYSTEM"} · {audit.correlationId || "-"}</p></div><time className="text-xs text-muted">{formatDateTime(audit.createdAt, locale)}</time></div>) : <p className="py-4 text-sm text-muted">{t("activity.empty")}</p>}
      </div>
    </section>

    <section className="rounded-lg border bg-white p-5">
      <h2 className="font-semibold">{t("adminSubscriptions.billingProfile")}</h2>
      <p className="mt-2 text-sm text-muted">{company.billingProfile?.legalName || t("adminSubscriptions.incomplete")} · {company.billingProfile?.billingEmail || "-"}</p>
      <p className="mt-3 text-xs text-muted">{t("admin.metrics.connectedWhatsApp")}: {company._count.accounts} · {t("adminPayments.title")}: {company._count.payments} · {t("adminBilling.invoices")}: {company._count.invoices} · {t("adminSupport.ticket")}: {company._count.supportTickets}</p>
    </section>
  </div>;
}

function displayDate(value: Date | null | undefined, locale: string) {
  return value ? formatDateTime(value, locale) : "-";
}
