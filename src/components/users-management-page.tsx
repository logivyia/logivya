"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, LoaderCircle, UserMinus, UserPlus } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@logivya/validation/password-policy";

import { useI18n } from "@/i18n/provider";
import { formatDateTime, formatNumber } from "@/i18n/format";
import { apiErrorMessage } from "@/i18n/api-error";

type Member = {
  id: string;
  role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  lifecycleState: "PENDING_ACTIVATION" | "ACTIVE_SHARED_MEMBER" | "SHARED_SUBSCRIPTION_EXPIRED" | "INDEPENDENT_OWNER" | "DETACHED" | "SUSPENDED_FOR_SECURITY" | "REMOVED_BEFORE_ACTIVATION";
  canManagePendingCredentials: boolean;
  isCurrent: boolean;
  user: {
    name: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    mustChangePassword: boolean;
    lastLoginAt?: string | null;
  };
};
type SeatUsage = {
  limit: number;
  used: number;
  available: number;
  planSlug: string;
  planName: string;
};

const input = "w-full rounded-xl border bg-input px-3 py-3 text-sm text-input-foreground outline-none focus:border-primary";
const panel = "rounded-lg border bg-card p-6 shadow-[var(--shadow-soft)]";
const button = "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const iconButton = "inline-flex size-10 items-center justify-center rounded-lg border disabled:opacity-40";

export function UsersManagementPage() {
  const { t, locale } = useI18n();
  const [users, setUsers] = useState<Member[] | null>(null);
  const [seatUsage, setSeatUsage] = useState<SeatUsage | null>(null);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [permissions, setPermissions] = useState({
    canCreateUsers: false,
    canRemoveUsers: false,
    canResetTemporaryPasswords: false,
  });

  const load = useCallback(async () => {
    const response = await fetch("/api/settings/users", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(t, result, "users.loadFailed"));
    setUsers(result.users);
    setSeatUsage(result.seatUsage ?? null);
    setPermissions(result.requesterPermissions ?? {
      canCreateUsers: false,
      canRemoveUsers: false,
      canResetTemporaryPasswords: false,
    });
  }, [t]);

  useEffect(() => {
    void load().catch((error) => setStatus(error instanceof Error ? error.message : t("users.loadFailed")));
  }, [load, t]);

  async function request(url: string, init: RequestInit) {
    setStatus("");
    const response = await fetch(url, init);
    const result = await response.json();
    if (!response.ok) throw new Error(apiErrorMessage(t, result));
    await load();
    return result;
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const temporaryPassword = String(form.get("temporaryPassword") ?? "");
    const focusField = (name: string) => {
      const field = formElement.elements.namedItem(name);
      if (field instanceof HTMLInputElement) field.focus();
    };
    if (!firstName) {
      setStatus(t("api.error.firstNameRequired"));
      focusField("firstName");
      return;
    }
    if (!lastName) {
      setStatus(t("api.error.lastNameRequired"));
      focusField("lastName");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(t("api.error.invalidEmail"));
      focusField("email");
      return;
    }
    if (temporaryPassword.length < MIN_PASSWORD_LENGTH) {
      setStatus(t("auth.passwordTooShort"));
      focusField("temporaryPassword");
      return;
    }
    setSubmitting(true);
    try {
      await request("/api/settings/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          temporaryPassword,
        }),
      });
      formElement.reset();
      setStatus(t("users.created"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("users.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("users.removeConfirm"))) return;
    try {
      await request(`/api/settings/users/${id}`, { method: "DELETE" });
      setStatus(t("users.removed"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("users.removeFailed"));
    }
  }

  async function issueTemporaryPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget || resetPassword.length < MIN_PASSWORD_LENGTH) return;
    setSubmitting(true);
    try {
      await request(`/api/settings/users/${resetTarget.id}/temporary-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ temporaryPassword: resetPassword }),
      });
      setStatus(t("users.temporaryPasswordReset"));
      setResetTarget(null);
      setResetPassword("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("users.temporaryPasswordResetFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("users.eyebrow")}</p>
      <h2 className="mt-2 text-3xl font-semibold">{t("users.addUser")}</h2>
    </header>

    {seatUsage ? <section className={`${panel} mb-6 flex flex-wrap items-center justify-between gap-4`}>
      <div><p className="text-xs text-muted">{t("adminSubscriptions.plan")}</p><b>{seatUsage.planName}</b></div>
      <div className="text-end">
        <p className="text-xs text-muted">{t("users.accountUsage")}</p>
        <b className="text-lg">{t("users.accountsUsed", { used: formatNumber(seatUsage.used, locale), limit: formatNumber(seatUsage.limit, locale) })}</b>
      </div>
    </section> : null}

    {permissions.canCreateUsers ? <form onSubmit={createUser} className={`${panel} mb-6 grid gap-4 md:grid-cols-2`}>
      <div className="md:col-span-2">
        <h3 className="text-lg font-semibold">{t("users.addNewUser")}</h3>
        <p className="mt-1 text-sm text-muted">{t("users.addNewUserDescription")}</p>
      </div>
      <label><span className="mb-2 block text-xs font-medium">{t("users.firstName")}</span><input required name="firstName" autoComplete="given-name" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">{t("users.lastName")}</span><input required name="lastName" autoComplete="family-name" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">{t("auth.email")}</span><input required type="email" name="email" autoComplete="off" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">{t("users.temporaryPassword")}</span><input required type="password" name="temporaryPassword" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={input} /></label>
      <p className="text-xs text-muted md:col-span-2">{t("auth.passwordPolicy")}</p>
      <button type="submit" disabled={submitting || seatUsage?.available === 0} className={`${button} md:col-span-2 md:justify-self-start`}>
        {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}{t("users.createUser")}
      </button>
      {seatUsage?.available === 0 ? <p className="text-sm text-muted md:col-span-2">{t("users.noAvailableAccounts")}</p> : null}
    </form> : <section className={`${panel} mb-6 text-sm text-muted`}>{t("membership.usersReadOnly")}</section>}

    {resetTarget ? <form onSubmit={issueTemporaryPassword} className={`${panel} mb-6 grid gap-4 sm:grid-cols-[1fr_auto]`}>
      <div className="sm:col-span-2">
        <h3 className="font-semibold">{t("users.resetTemporaryPassword")}</h3>
        <p className="mt-1 text-sm text-muted">{resetTarget.user.name} - {resetTarget.user.email}</p>
      </div>
      <input required autoFocus type="password" minLength={MIN_PASSWORD_LENGTH} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className={input} aria-label={t("users.temporaryPassword")} />
      <div className="flex gap-2">
        <button className={button} disabled={submitting}>{t("users.saveTemporaryPassword")}</button>
        <button type="button" className="rounded-lg border px-4 py-3 text-sm font-semibold" onClick={() => { setResetTarget(null); setResetPassword(""); }}>{t("common.cancel")}</button>
      </div>
    </form> : null}

    {status && <p role="status" className="mb-4 rounded-lg border bg-card p-3 text-sm text-muted">{status}</p>}

    <section className={panel}>
      {!users ? <LoaderCircle className="size-6 animate-spin text-primary" /> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-start text-xs text-muted"><th className="py-3">{t("users.user")}</th><th>{t("users.role")}</th><th>{t("common.status")}</th><th>{t("users.lastLogin")}</th><th className="text-end">{t("users.actions")}</th></tr></thead>
          <tbody>{users.map((item) => {
            const accessStatus = item.user.mustChangePassword ? "PASSWORD_CHANGE_PENDING" : item.status;
            return <tr key={item.id} className="border-b last:border-0">
              <td className="py-4"><b>{item.user.name}</b>{item.isCurrent ? <span className="ms-2 text-xs font-semibold text-primary">{t("users.currentUser")}</span> : null}<p className="text-xs text-muted">{item.user.email}</p></td>
              <td><span className="font-medium">{item.role === "OWNER" ? t("users.owner") : t("users.standardUser")}</span></td>
              <td>{accessStatus === "PASSWORD_CHANGE_PENDING" ? t("users.passwordChangePending") : accessStatus === "ACTIVE" ? t("users.active") : t("users.suspended")}</td>
              <td>{item.user.lastLoginAt ? formatDateTime(item.user.lastLoginAt, locale) : "-"}</td>
              <td><div className="flex justify-end gap-2">
                {item.role !== "OWNER" && item.canManagePendingCredentials ? <>
                  {permissions.canResetTemporaryPasswords ? <button title={t("users.resetTemporaryPassword")} type="button" onClick={() => { setResetTarget(item); setResetPassword(""); }} className={`${iconButton} text-primary`}><KeyRound className="size-4" /></button> : null}
                  {permissions.canRemoveUsers ? <button title={t("users.remove")} type="button" onClick={() => void remove(item.id)} className={`${iconButton} text-danger`}><UserMinus className="size-4" /></button> : null}
                </> : null}
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>
  </>;
}
