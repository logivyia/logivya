"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";

type Group = { id: string; name: string; account: { label: string } };
type Category = { id: string; name: string; color: string; _count: { groups: number }; groups: Array<{ groupId: string }> };
type Data = { groups: Group[]; categories: Category[] };
const button = "inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-50";
const primary = `${button} border-orange-500 bg-orange-500 font-semibold text-white`;

export function CategoriesManagementPage() {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const load = useCallback(() => fetch("/api/platform", { cache: "no-store" }).then((response) => response.json()).then(setData), []);
  useEffect(() => { void load(); }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), color: form.get("color"), groupIds: form.getAll("groupIds") }) });
    setStatus(response.ok ? "Kategori oluşturuldu." : (await response.json()).error); if (response.ok) { setCreating(false); void load(); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || !data) return;
    const form = new FormData(event.currentTarget); const selected = form.getAll("groupIds").map(String); const current = editing.groups.map((item) => item.groupId);
    const update = await fetch(`/api/categories/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), color: form.get("color") }) });
    if (!update.ok) { setStatus((await update.json()).error); return; }
    const additions = selected.filter((id) => !current.includes(id)); const removals = current.filter((id) => !selected.includes(id));
    if (additions.length) await fetch(`/api/categories/${editing.id}/groups`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ groupIds: additions }) });
    await Promise.all(removals.map((groupId) => fetch(`/api/categories/${editing.id}/groups/${groupId}`, { method: "DELETE" })));
    setStatus("Kategori ve grup atamaları kaydedildi."); setEditing(null); void load();
  }
  async function archive(category: Category, label: string) {
    if (!confirm(`${category.name} kategorisini ${label.toLowerCase()} istediğinize emin misiniz? Gruplar silinmeyecek.`)) return;
    const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" }); setStatus(response.ok ? "Kategori arşivlendi. Gruplar korundu." : (await response.json()).error); void load();
  }
  if (!data) return <LoaderCircle className="size-7 animate-spin text-orange-500" />;
  const form = (category?: Category) => <form onSubmit={category ? save : create} className="rounded-2xl border bg-card p-5 shadow-xl"><div className="flex items-center justify-between"><h2 className="font-semibold">{category ? "Kategoriyi düzenle" : "Yeni kategori"}</h2><button type="button" onClick={() => category ? setEditing(null) : setCreating(false)}><X className="size-5" /></button></div><div className="mt-5 grid gap-4"><label><span className="mb-2 block text-xs font-medium">Kategori adı</span><input required name="name" defaultValue={category?.name} className="w-full rounded-xl border bg-white p-3" /></label><label><span className="mb-2 block text-xs font-medium">Renk</span><input name="color" type="color" defaultValue={category?.color || "#f97316"} /></label><div><p className="mb-2 text-xs font-medium">Atanmış gruplar</p><div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">{data.groups.map((group) => <label key={group.id} className="rounded-xl border bg-white p-3 text-sm"><input name="groupIds" value={group.id} defaultChecked={category?.groups.some((item) => item.groupId === group.id)} type="checkbox" className="me-2" />{group.name}<small className="ms-2 text-muted">{group.account.label}</small></label>)}</div></div><button className={primary}>{category ? <Save className="size-4" /> : <Plus className="size-4" />}{category ? "Değişiklikleri kaydet" : "Kategori oluştur"}</button></div></form>;
  return <><header className="mb-7 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-500">Segmentasyon</p><h1 className="mt-2 text-3xl font-semibold">Kategoriler</h1><p className="mt-2 text-sm text-muted">Grupları tekrar kullanılabilir hedef kitleler olarak yönetin.</p></div><button className={primary} onClick={() => setCreating(true)}><Plus className="size-4" />Yeni kategori</button></header>{status && <p className="mb-5 rounded-xl border bg-card p-3 text-sm">{status}</p>}{creating && <div className="mb-6">{form()}</div>}{editing && <div className="mb-6">{form(editing)}</div>}<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{data.categories.map((category) => <article key={category.id} className="rounded-2xl border bg-card p-5"><span className="block size-3 rounded-full" style={{ background: category.color }} /><h2 className="mt-5 font-semibold">{category.name}</h2><p className="mt-1 text-sm text-muted">{category._count.groups} atanmış grup</p><div className="mt-5 flex flex-wrap gap-2 border-t pt-4"><button className={button} onClick={() => setEditing(category)}><Pencil className="size-4" />Düzenle</button><button className={button} onClick={() => void archive(category, "arşivlemek")}><Archive className="size-4" /></button><button className={button} onClick={() => void archive(category, "silmek")}><Trash2 className="size-4" /></button></div></article>)}</div></>;
}
