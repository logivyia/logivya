"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search, Send } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { localDateTimeToIso } from "@/lib/datetime";

type Group = { id: string; name: string; participantCount: number; canSend: boolean; account: { label: string } };
type Category = { id: string; name: string; _count: { groups: number }; groups?: Array<{ groupId: string }> };
type Data = { groups: Group[]; categories: Category[] };
type Mode = "SEND_NOW" | "SCHEDULED" | "RECURRING";
const card = "rounded-2xl border bg-card p-5 shadow-[0_18px_60px_rgba(0,0,0,.06)]";
const tab = "rounded-xl border bg-white px-3 py-2 text-sm";

export function CampaignComposerPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { const stored = JSON.parse(localStorage.getItem("logivya.selectedGroupIds") || "[]"); return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []; }
    catch { localStorage.removeItem("logivya.selectedGroupIds"); return []; }
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("SEND_NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [interval, setIntervalValue] = useState(1);
  const [sending, setSending] = useState(false);
  useEffect(() => { void fetch("/api/platform", { cache: "no-store" }).then((response) => response.json()).then(setData); }, []);
  const groups = useMemo(() => (data?.groups.filter((group) => group.canSend && group.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) || []), [data, search]);
  const resolved = useMemo(() => new Set([...selected, ...(data?.categories.filter((category) => selectedCategories.includes(category.id)).flatMap((category) => category.groups?.map((item) => item.groupId) || []) || [])]), [data, selected, selectedCategories]);
  async function send() {
    setSending(true); setStatus("");
    const response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: text.slice(0, 60), content: text, groupIds: selected, categoryIds: selectedCategories, scheduleType: mode, scheduledAt: mode === "SCHEDULED" ? localDateTimeToIso(scheduledAt) : undefined, recurringRule: mode === "RECURRING" ? { frequency, interval } : undefined }) });
    const result = await response.json(); setSending(false);
    if (!response.ok) { setStatus(t(result.error || "errors.generic")); return; }
    setStatus(t("composer.queued")); setText(""); setSelected([]); setSelectedCategories([]); localStorage.removeItem("logivya.selectedGroupIds");
  }
  if (!data) return <div className="grid min-h-52 place-items-center"><LoaderCircle className="size-7 animate-spin text-orange-500" /></div>;
  return <><header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.2em] text-orange-500">{t("composer.eyebrow")}</p><h1 className="mt-2 text-3xl font-semibold">{t("nav.sendMessage")}</h1></header><div className="grid items-start gap-6 xl:grid-cols-[.9fr_1.1fr]">
    <section className={card}><h2 className="font-semibold">{t("composer.selectAudiences")}</h2><label className="mt-4 flex items-center gap-2 rounded-xl border bg-white px-3"><Search className="size-4 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("composer.search")} className="w-full py-3 text-sm outline-none" /></label><p className="mt-5 text-xs font-semibold uppercase text-muted">{t("nav.categories")}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.categories.map((category) => <label key={category.id} className={cn("flex items-center gap-2 rounded-xl border p-3 text-sm", selectedCategories.includes(category.id) && "border-orange-500 bg-orange-50")}><input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={(event) => setSelectedCategories((value) => event.target.checked ? [...value, category.id] : value.filter((id) => id !== category.id))} /><b>{category.name}</b><span className="ms-auto text-muted">{category._count.groups}</span></label>)}</div><p className="mt-5 text-xs font-semibold uppercase text-muted">{t("common.groups")}</p><label className="mt-3 flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold"><input type="checkbox" checked={groups.length > 0 && groups.every((group) => selected.includes(group.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...groups.map((group) => group.id)])] : selected.filter((id) => !groups.some((group) => group.id === id)))} />{t("composer.selectVisible")}</label><div className="mt-3 grid max-h-[430px] gap-2 overflow-auto">{groups.map((group) => <label key={group.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", resolved.has(group.id) && "border-orange-500 bg-orange-50")}><input type="checkbox" checked={selected.includes(group.id)} onChange={(event) => setSelected((value) => event.target.checked ? [...new Set([...value, group.id])] : value.filter((id) => id !== group.id))} /><span><b className="block">{group.name}</b><small className="text-muted">{group.account.label} · {t("composer.memberCount",{count:group.participantCount})}</small></span></label>)}</div></section>
    <section className={`${card} xl:sticky xl:top-24`}><div className="flex items-center justify-between"><h2 className="font-semibold">{t("composer.write")}</h2><span className="text-xs text-muted">{text.length}/4096</span></div><textarea maxLength={4096} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("composer.placeholder")} className="mt-4 min-h-64 w-full rounded-xl border bg-white p-4 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /><div className="mt-4 grid grid-cols-3 gap-2">{(["SEND_NOW", "SCHEDULED", "RECURRING"] as Mode[]).map((value) => <button key={value} type="button" onClick={() => setMode(value)} className={cn(tab, mode === value && "border-orange-500 bg-orange-50 font-semibold text-orange-700")}>{value === "SEND_NOW" ? t("composer.sendNow") : value === "SCHEDULED" ? t("composer.schedule") : t("composer.recurring")}</button>)}</div>{mode === "SCHEDULED" && <input className="mt-4 w-full rounded-xl border bg-white px-3 py-3 text-sm" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />}{mode === "RECURRING" && <div className="mt-4 flex gap-2"><select className="flex-1 rounded-xl border bg-white px-3 py-3 text-sm" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="DAILY">{t("composer.daily")}</option><option value="WEEKLY">{t("composer.weekly")}</option><option value="MONTHLY">{t("composer.monthly")}</option></select><input aria-label={t("composer.interval")} min={1} max={365} type="number" className="w-24 rounded-xl border bg-white px-3 py-3 text-sm" value={interval} onChange={(event) => setIntervalValue(Number(event.target.value))} /></div>}<div className="mt-5 rounded-xl bg-orange-50 p-4"><p className="text-xs font-semibold text-orange-700">{t("composer.targets",{count:resolved.size})}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{text || t("composer.emptyPreview")}</p></div><button disabled={sending || !text || !resolved.size || (mode === "SCHEDULED" && !scheduledAt)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-50" onClick={() => void send()}>{sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{t("composer.reviewSend")}</button>{status && <p className="mt-3 rounded-xl border p-3 text-sm">{status}</p>}</section>
  </div></>;
}
