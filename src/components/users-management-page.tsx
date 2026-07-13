"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, LoaderCircle, MailX, UserMinus, UserPlus } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { formatDate, formatDateTime, formatNumber } from "@/i18n/format";
import { apiErrorMessage } from "@/i18n/api-error";

type Member = {
  id: string;
  role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  user: { name: string; email: string; sessions: Array<{ lastActiveAt: string }> };
};
type Invitation = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
};
type SeatUsage = { limit: number; used: number; activeMembers: number; pendingInvitations: number; available: number; planName: string };
type IssuedInvitation = { inviteCode: string; acceptUrl: string; emailSent: boolean; invitation: Invitation };

const input = "w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none focus:border-primary";
const panel = "rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";

export function UsersManagementPage() {
  const { t, locale } = useI18n();
  const [users, setUsers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [seatUsage, setSeatUsage] = useState<SeatUsage | null>(null);
  const [status, setStatus] = useState("");
  const [issuedInvitation, setIssuedInvitation] = useState<IssuedInvitation | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/settings/users", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(t, result, "users.loadFailed"));
    setUsers(result.users);
    setInvitations(result.invitations ?? []);
    setSeatUsage(result.seatUsage ?? null);
  }, [t]);

  useEffect(() => {
    void load().catch((error) => setStatus(error instanceof Error ? error.message : t("users.loadFailed")));
  }, [load, t]);

  async function request<T = unknown>(url: string, init: RequestInit) {
    setStatus("");
    const response = await fetch(url, init);
    const result = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(t, result));
    await load();
    return result as T;
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<IssuedInvitation>("/api/settings/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), role: form.get("role") }),
      });
      event.currentTarget.reset();
      setIssuedInvitation(result);
      setStatus(t("users.invited"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("users.inviteFailed"));
    }
  }

  async function copyInvitation(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(t("users.copied", { label }));
    } catch {
      setStatus(t("users.copyFailed", { label }));
    }
  }

  async function update(id: string, body: Partial<Pick<Member, "role" | "status">>) {
    try {
      await request(`/api/settings/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("users.updateFailed"));
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("users.removeConfirm"))) return;
    try {
      await request(`/api/settings/users/${id}`, { method: "DELETE" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("users.removeFailed"));
    }
  }

  async function revokeInvitation(id: string) {
    if (!window.confirm(t("users.revokeInvitationConfirm"))) return;
    try {
      await request(`/api/settings/invitations/${id}`, { method: "DELETE" });
      setStatus(t("users.invitationRevoked"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("users.invitationRevokeFailed"));
    }
  }

  return <>
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("users.eyebrow")}</p>
      <h2 className="mt-2 text-3xl font-semibold">{t("users.title")}</h2>
      <p className="mt-2 text-sm text-muted">{t("users.description")}</p>
    </header>
    {seatUsage ? <section className={`${panel} mb-6 grid gap-3 sm:grid-cols-4`}>
      <div><p className="text-xs text-muted">{t("adminSubscriptions.plan")}</p><b>{seatUsage.planName}</b></div>
      <div><p className="text-xs text-muted">{t("users.usedSeats")}</p><b>{formatNumber(seatUsage.used, locale)} / {formatNumber(seatUsage.limit, locale)}</b></div>
      <div><p className="text-xs text-muted">{t("users.activeUsers")}</p><b>{seatUsage.activeMembers}</b></div>
      <div><p className="text-xs text-muted">{t("users.pendingAvailable")}</p><b>{formatNumber(seatUsage.pendingInvitations, locale)} / {formatNumber(seatUsage.available, locale)}</b></div>
    </section> : null}
    <form onSubmit={invite} className={`${panel} mb-6 grid gap-4 md:grid-cols-4`}>
      <label><span className="mb-2 block text-xs font-medium">{t("auth.name")}</span><input required name="name" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">{t("auth.email")}</span><input required type="email" name="email" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">{t("users.role")}</span><select name="role" className={input}><option value="OPERATOR">{t("users.operator")}</option><option value="ADMIN">{t("users.admin")}</option><option value="VIEWER">{t("users.viewer")}</option></select></label>
      <button className={`${button} self-end`}><UserPlus className="size-4" />{t("users.invite")}</button>
    </form>
    {issuedInvitation ? <section className={`${panel} mb-6`}>
      <h3 className="font-semibold">{t("users.invitationReady")}</h3>
      <p className="mt-1 text-sm text-muted">{t("users.invitationSecurityNotice")}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 rounded-xl border bg-input px-3 py-3 font-mono text-sm text-input-foreground">{issuedInvitation.inviteCode}</div>
        <button title={t("users.copyInvitationCode")} type="button" onClick={() => void copyInvitation(issuedInvitation.inviteCode, t("users.invitationCode"))} className={button}><Copy className="size-4" />{t("users.copyCode")}</button>
        <div className="min-w-0 break-all rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground">{issuedInvitation.acceptUrl}</div>
        <button title={t("users.copyInvitationLink")} type="button" onClick={() => void copyInvitation(issuedInvitation.acceptUrl, t("users.invitationLink"))} className={button}><Copy className="size-4" />{t("users.copyLink")}</button>
      </div>
      <p className="mt-3 text-xs text-muted">{t("users.emailStatus")}: {issuedInvitation.emailSent ? t("users.emailSent") : t("users.emailNotSent")}</p>
    </section> : null}
    {status && <p className="mb-4 rounded-xl border bg-card p-3 text-sm text-muted">{status}</p>}
    {invitations.some((item) => item.status === "PENDING") ? <section className={`${panel} mb-6`}>
      <h3 className="font-semibold">{t("users.pendingInvitations")}</h3>
      <div className="mt-3 divide-y">
        {invitations.filter((item) => item.status === "PENDING").map((item) => <div key={item.id} className="flex items-center gap-3 py-3 text-sm">
          <div className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><span className="text-xs text-muted">{item.email} · {formatDate(item.expiresAt, locale)}</span></div>
          <button title={t("users.revokeInvitation")} type="button" onClick={() => void revokeInvitation(item.id)} className="rounded-lg border p-2 text-danger"><MailX className="size-4" /></button>
        </div>)}
      </div>
    </section> : null}
    <section className={panel}>
      {!users ? <LoaderCircle className="size-6 animate-spin text-primary" /> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-start text-xs text-muted"><th className="py-3">{t("users.user")}</th><th>{t("users.role")}</th><th>{t("common.status")}</th><th>{t("users.lastLogin")}</th><th>{t("users.actions")}</th></tr></thead>
          <tbody>{users.map((item) => <tr key={item.id} className="border-b last:border-0">
            <td className="py-4"><b>{item.user.name}</b><p className="text-xs text-muted">{item.user.email}</p></td>
            <td><select disabled={item.role === "OWNER"} aria-label={`${item.user.name} ${t("users.role")}`} className="rounded-lg border bg-input px-2 py-2 text-input-foreground disabled:opacity-60" value={item.role} onChange={(event) => void update(item.id, { role: event.target.value as Member["role"] })}><option value="OWNER" disabled>{t("users.owner")}</option><option value="ADMIN">{t("users.admin")}</option><option value="OPERATOR">{t("users.operator")}</option><option value="VIEWER">{t("users.viewer")}</option></select></td>
            <td><select disabled={item.role === "OWNER"} aria-label={`${item.user.name} ${t("common.status")}`} className="rounded-lg border bg-input px-2 py-2 text-input-foreground disabled:opacity-60" value={item.status} onChange={(event) => void update(item.id, { status: event.target.value as Member["status"] })}><option value="ACTIVE">{t("users.active")}</option>{item.status === "INVITED" ? <option value="INVITED" disabled>{t("users.invitedStatus")}</option> : null}<option value="SUSPENDED">{t("users.suspended")}</option></select></td>
            <td>{item.user.sessions[0] ? formatDateTime(item.user.sessions[0].lastActiveAt, locale) : "-"}</td>
            <td className="text-end"><div className="flex justify-end gap-2"><button disabled={item.role === "OWNER"} title={t("users.remove")} type="button" onClick={() => void remove(item.id)} className="rounded-lg border p-2 text-danger disabled:opacity-40"><UserMinus className="size-4"/></button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>;
}
