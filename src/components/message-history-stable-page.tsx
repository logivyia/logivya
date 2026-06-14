/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useCallback, useEffect, useState } from "react";
import { Archive, FileText, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { getMessageStatusLabel } from "@/lib/i18n/status-labels";

type Campaign = { id:string;title:string;status:string;totalRecipients:number;sentCount:number;failedCount:number;createdAt:string };

const ghost = "inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50";
const danger = "inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 hover:bg-red-100";

async function post(url:string, body:unknown = {}) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || result.message || "İşlem başarısız.");
  return result;
}

export function MessageHistoryStablePage() {
  const { locale } = useI18n();
  const [showDeleted, setShowDeleted] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/messages/campaigns?showDeleted=${showDeleted}`, { cache: "no-store" });
    const result = await response.json();
    setCampaigns(response.ok ? result.campaigns : []);
    setSelected([]);
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(id:string, action:"archive"|"delete") {
    if (!confirm(action === "archive" ? "Kampanya arşivlensin mi?" : "Kampanya silinsin mi?")) return;
    await post(`/api/messages/campaigns/${id}/${action}`);
    void load();
  }

  async function bulk(action:"archive"|"delete") {
    if (!selected.length) return;
    if (!confirm(action === "archive" ? "Seçilen kampanyalar arşivlensin mi?" : "Seçilen kampanyalar silinsin mi?")) return;
    try {
      const result = await post("/api/messages/campaigns/bulk", { ids: selected, action });
      setStatus(`${result.affected} kayıt güncellendi.`);
      void load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "İşlem başarısız.");
    }
  }

  async function deleteEveryone(id:string) {
    if (!confirm("Bu mesajı WhatsApp'ta herkesten silmek istediğinizden emin misiniz?")) return;
    const response = await fetch(`/api/messages/campaigns/${id}/delete-everyone`, { method: "POST" });
    const result = await response.json();
    setStatus(result.message || `${result.deleted || 0} mesaj silindi, ${result.failed || 0} mesaj silinemedi.`);
  }

  const allSelected = campaigns.length > 0 && selected.length === campaigns.length;

  return <>
    <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.22em] text-primary">Raporlama</p><h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Mesaj geçmişi</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Kampanya ve alıcı seviyesindeki teslimat sonuçlarını takip edin.</p></div>
      <div className="flex flex-wrap gap-2"><button disabled={!selected.length} className={ghost} onClick={()=>void bulk("archive")}>Seçilenleri arşivle</button><button disabled={!selected.length} className={ghost} onClick={()=>void bulk("delete")}>Seçilenleri sil</button><button className={ghost} onClick={()=>setShowDeleted(value=>!value)}>{showDeleted ? "Silinenleri gizle" : "Silinenleri göster"}</button><button className={ghost}><FileText className="size-4"/>Raporu dışa aktar</button></div>
    </header>
    {status && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{status}</p>}
    {loading ? <LoaderCircle className="animate-spin text-primary"/> : <section className="panel overflow-hidden rounded-2xl">
      {!campaigns.length ? <div className="p-10 text-center text-sm text-muted">Henüz kampanya yok.</div> : <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="border-b bg-foreground/[.025] text-[10px] uppercase text-muted"><tr><th className="px-5 py-4"><input type="checkbox" checked={allSelected} onChange={e=>setSelected(e.target.checked?campaigns.map(c=>c.id):[])}/></th><th className="px-5 py-4 font-medium">Kampanya</th><th className="px-5 py-4 font-medium">Durum</th><th className="px-5 py-4 font-medium">İlerleme</th><th className="px-5 py-4 font-medium">Tarih</th><th className="px-5 py-4 font-medium">İşlemler</th></tr></thead><tbody>{campaigns.map(c=><tr key={c.id} className="border-b last:border-0"><td className="px-5 py-4"><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/></td><td className="px-5 py-4 font-medium">{c.title}</td><td className="px-5 py-4">{getMessageStatusLabel(c.status, locale)}</td><td className="px-5 py-4">{c.sentCount} gönderildi, {c.failedCount} başarısız / {c.totalRecipients}</td><td className="px-5 py-4 text-muted">{new Date(c.createdAt).toLocaleString()}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2">{c.failedCount>0&&<button title="Başarısızları tekrar dene" onClick={()=>void post(`/api/messages/campaigns/${c.id}/retry-failed`).then(load)} className={ghost}><RefreshCw className="size-4"/></button>}{c.status!=="DELETED"&&<><button onClick={()=>void mutate(c.id,"archive")} className={ghost}><Archive className="size-4"/>Arşivle</button><button disabled title="Bu mesaj için WhatsApp mesaj kimliği bulunamadı." onClick={()=>void deleteEveryone(c.id)} className={ghost}>Herkesten sil</button><button onClick={()=>void mutate(c.id,"delete")} className={danger}><Trash2 className="size-4"/>Sil</button></>}</div></td></tr>)}</tbody></table></div>}
    </section>}
  </>;
}
