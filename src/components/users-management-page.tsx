"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, Pencil, UserMinus, UserPlus } from "lucide-react";
import { useI18n } from "@/i18n/provider";

type Member = {
  id: string;
  role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  user: { name: string; email: string; sessions: Array<{ lastActiveAt: string }> };
};

const input = "w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary-soft";
const panel = "rounded-2xl border bg-card p-6 shadow-[0_18px_60px_rgba(0,0,0,.06)]";
const button = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50";

export function UsersManagementPage() {
  const { t, locale } = useI18n();
  const [users, setUsers] = useState<Member[] | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/settings/users", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setUsers(result.users);
  }, []);

  useEffect(() => {
    void load().catch((error) => setStatus(error instanceof Error ? error.message : "Kullanıcılar yüklenemedi."));
  }, [load]);

  async function request(url: string, init: RequestInit) {
    setStatus("");
    const response = await fetch(url, init);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || t("errors.generic"));
    await load();
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/settings/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), role: form.get("role") }),
      });
      event.currentTarget.reset();
      setStatus(t("users.invited"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Davet gönderilemedi.");
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
      setStatus(error instanceof Error ? error.message : "Kullanıcı güncellenemedi.");
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("users.removeConfirm"))) return;
    try {
      await request(`/api/settings/users/${id}`, { method: "DELETE" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kullanıcı kaldırılamadı.");
    }
  }

  async function edit(item: Member) {
    const name = window.prompt(t("users.namePrompt"), item.user.name)?.trim();
    if (!name || name === item.user.name) return;
    try {
      await request(`/api/settings/users/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      setStatus(t("users.updated"));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("errors.generic")); }
  }

  async function changePassword(item: Member) {
    const password = window.prompt(t("users.passwordPrompt"));
    if (!password) return;
    try {
      await request(`/api/settings/users/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      setStatus(t("users.passwordChanged"));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("errors.generic")); }
  }

  return <>
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("users.eyebrow")}</p>
      <h2 className="mt-2 text-3xl font-semibold">{t("users.title")}</h2>
      <p className="mt-2 text-sm text-muted">{t("users.description")}</p>
    </header>
    <form onSubmit={invite} className={`${panel} mb-6 grid gap-4 md:grid-cols-4`}>
      <label><span className="mb-2 block text-xs font-medium">{t("auth.name")}</span><input required name="name" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">{t("auth.email")}</span><input required type="email" name="email" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">{t("users.role")}</span><select name="role" className={input}><option value="OPERATOR">{t("users.operator")}</option><option value="ADMIN">{t("users.admin")}</option><option value="VIEWER">{t("users.viewer")}</option></select></label>
      <button className={`${button} self-end`}><UserPlus className="size-4" />{t("users.invite")}</button>
    </form>
    {status && <p className="mb-4 rounded-xl border bg-card p-3 text-sm text-muted">{status}</p>}
    <section className={panel}>
      {!users ? <LoaderCircle className="size-6 animate-spin text-primary" /> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-start text-xs text-muted"><th className="py-3">{t("users.user")}</th><th>{t("users.role")}</th><th>{t("common.status")}</th><th>{t("users.lastLogin")}</th><th>{t("users.actions")}</th></tr></thead>
          <tbody>{users.map((item) => <tr key={item.id} className="border-b last:border-0">
            <td className="py-4"><b>{item.user.name}</b><p className="text-xs text-muted">{item.user.email}</p></td>
            <td><select aria-label={`${item.user.name} ${t("users.role")}`} className="rounded-lg border bg-white px-2 py-2" value={item.role} onChange={(event) => void update(item.id, { role: event.target.value as Member["role"] })}><option value="OWNER">{t("users.owner")}</option><option value="ADMIN">{t("users.admin")}</option><option value="OPERATOR">{t("users.operator")}</option><option value="VIEWER">{t("users.viewer")}</option></select></td>
            <td><select aria-label={`${item.user.name} ${t("common.status")}`} className="rounded-lg border bg-white px-2 py-2" value={item.status} onChange={(event) => void update(item.id, { status: event.target.value as Member["status"] })}><option value="ACTIVE">{t("users.active")}</option><option value="INVITED">{t("users.invitedStatus")}</option><option value="SUSPENDED">{t("users.suspended")}</option></select></td>
            <td>{item.user.sessions[0] ? new Date(item.user.sessions[0].lastActiveAt).toLocaleString(locale) : "-"}</td>
            <td className="text-end"><div className="flex justify-end gap-2"><button title={t("users.edit")} type="button" onClick={() => void edit(item)} className="rounded-lg border p-2"><Pencil className="size-4"/></button><button title={t("users.changePassword")} type="button" onClick={() => void changePassword(item)} className="rounded-lg border p-2"><KeyRound className="size-4"/></button><button title={t("users.remove")} type="button" onClick={() => void remove(item.id)} className="rounded-lg border p-2 text-danger"><UserMinus className="size-4"/></button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>;
}
