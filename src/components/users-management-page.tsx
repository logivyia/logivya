"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";

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
    if (!response.ok) throw new Error(result.error || "İşlem tamamlanamadı.");
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
      setStatus("Kullanıcı daveti oluşturuldu.");
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
    if (!window.confirm("Bu kullanıcıyı çalışma alanından kaldırmak istediğinize emin misiniz?")) return;
    try {
      await request(`/api/settings/users/${id}`, { method: "DELETE" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Kullanıcı kaldırılamadı.");
    }
  }

  return <>
    <header className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">Logivya Yönetim</p>
      <h2 className="mt-2 text-3xl font-semibold">Kullanıcılar</h2>
      <p className="mt-2 text-sm text-muted">Şirket kullanıcılarını davet edin, rollerini ve erişim durumlarını yönetin.</p>
    </header>
    <form onSubmit={invite} className={`${panel} mb-6 grid gap-4 md:grid-cols-4`}>
      <label><span className="mb-2 block text-xs font-medium">Ad soyad</span><input required name="name" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">E-posta</span><input required type="email" name="email" className={input} /></label>
      <label><span className="mb-2 block text-xs font-medium">Rol</span><select name="role" className={input}><option value="OPERATOR">Operatör</option><option value="ADMIN">Yönetici</option><option value="VIEWER">Görüntüleyici</option></select></label>
      <button className={`${button} self-end`}><UserPlus className="size-4" />Kullanıcı davet et</button>
    </form>
    {status && <p className="mb-4 rounded-xl border bg-card p-3 text-sm text-muted">{status}</p>}
    <section className={panel}>
      {!users ? <LoaderCircle className="size-6 animate-spin text-primary" /> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-start text-xs text-muted"><th className="py-3">Kullanıcı</th><th>Rol</th><th>Durum</th><th>Son giriş</th><th /></tr></thead>
          <tbody>{users.map((item) => <tr key={item.id} className="border-b last:border-0">
            <td className="py-4"><b>{item.user.name}</b><p className="text-xs text-muted">{item.user.email}</p></td>
            <td><select aria-label={`${item.user.name} rolü`} className="rounded-lg border bg-white px-2 py-2" value={item.role} onChange={(event) => void update(item.id, { role: event.target.value as Member["role"] })}><option value="OWNER">Sahip</option><option value="ADMIN">Yönetici</option><option value="OPERATOR">Operatör</option><option value="VIEWER">Görüntüleyici</option></select></td>
            <td><select aria-label={`${item.user.name} durumu`} className="rounded-lg border bg-white px-2 py-2" value={item.status} onChange={(event) => void update(item.id, { status: event.target.value as Member["status"] })}><option value="ACTIVE">Aktif</option><option value="INVITED">Davet edildi</option><option value="SUSPENDED">Askıya alındı</option></select></td>
            <td>{item.user.sessions[0] ? new Date(item.user.sessions[0].lastActiveAt).toLocaleString("tr-TR") : "-"}</td>
            <td className="text-end"><button type="button" onClick={() => void remove(item.id)} className="rounded-lg border px-3 py-2 text-xs text-danger">Kaldır</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>;
}
