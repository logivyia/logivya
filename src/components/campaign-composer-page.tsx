"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string; participantCount: number; canSend: boolean; account: { label: string } };
type Category = { id: string; name: string; _count: { groups: number }; groups?: Array<{ groupId: string }> };
type PlatformData = { groups: Group[]; categories: Category[] };
type Mode = "SEND_NOW" | "SCHEDULED" | "RECURRING";
type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

const card = "panel rounded-2xl p-5";
const ghost = "inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm hover:bg-primary-soft";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

export function CampaignComposerPage() {
  const { t } = useI18n();
  const [data, setData] = useState<PlatformData | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("SEND_NOW");
  const [scheduledAt, setScheduledAt] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("DAILY");
  const [interval, setIntervalValue] = useState(1);

  useEffect(() => {
    void fetch("/api/platform", { cache: "no-store" }).then((response) => response.json()).then(setData);
    try {
      const stored = JSON.parse(localStorage.getItem("logivya.selectedGroupIds") || "[]");
      if (Array.isArray(stored)) setSelected(stored.filter((id) => typeof id === "string"));
    } catch {
      localStorage.removeItem("logivya.selectedGroupIds");
    }
  }, []);

  const groups = useMemo(() => data?.groups.filter((group) => group.canSend) || [], [data]);
  const resolved = useMemo(() => new Set([
    ...selected,
    ...(data?.categories.filter((category) => selectedCategories.includes(category.id)).flatMap((category) => category.groups?.map((item) => item.groupId) || []) || []),
  ]), [data, selected, selectedCategories]);

  async function send() {
    setStatus("");
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: text.slice(0, 60),
        content: text,
        groupIds: selected,
        categoryIds: selectedCategories,
        scheduleType: mode,
        scheduledAt: mode === "SCHEDULED" ? scheduledAt : undefined,
        recurringRule: mode === "RECURRING" ? { frequency, interval } : undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus(t(result.error || "errors.generic"));
      return;
    }
    setStatus(t("composer.queued"));
    setText("");
    setSelected([]);
    setSelectedCategories([]);
    localStorage.removeItem("logivya.selectedGroupIds");
  }

  if (!data) return <div className="grid min-h-52 place-items-center"><LoaderCircle className="size-7 animate-spin text-primary" /></div>;

  return <>
    <header className="mb-7"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.22em] text-primary">{t("composer.eyebrow")}</p><h2 className="text-3xl font-semibold">{t("composer.title")}</h2><p className="mt-2 text-sm text-muted">{t("composer.description")}</p></header>
    <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <div className="space-y-5">
        <section className={card}>
          <h3 className="text-sm font-semibold">{t("composer.selectAudiences")}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.categories.map((category) => <label key={category.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", selectedCategories.includes(category.id) && "border-primary bg-primary-soft")}><input checked={selectedCategories.includes(category.id)} onChange={(event) => setSelectedCategories((value) => event.target.checked ? [...value, category.id] : value.filter((id) => id !== category.id))} type="checkbox" /><b>{category.name}</b><span className="ms-auto text-muted">{category._count.groups}</span></label>)}</div>
          <div className="my-5 border-t" />
          <label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold"><input checked={groups.length > 0 && selected.length === groups.length} onChange={(event) => setSelected(event.target.checked ? groups.map((group) => group.id) : [])} type="checkbox" />{t("groups.selectAll")}</label>
          <div className="mt-3 grid max-h-80 gap-3 overflow-auto sm:grid-cols-2">{groups.map((group) => <label key={group.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", resolved.has(group.id) && "border-primary bg-primary-soft")}><input checked={selected.includes(group.id)} onChange={(event) => setSelected((value) => event.target.checked ? [...new Set([...value, group.id])] : value.filter((id) => id !== group.id))} type="checkbox" /><span><strong className="block">{group.name}</strong><span className="text-xs text-muted">{group.account.label} · {group.participantCount}</span></span></label>)}</div>
        </section>
        <section className={card}>
          <h3 className="text-sm font-semibold">{t("composer.write")}</h3>
          <textarea maxLength={4096} value={text} onChange={(event) => setText(event.target.value)} className="mt-4 min-h-48 w-full rounded-xl border bg-white p-4 text-sm outline-none" />
          <div className="mt-4 flex flex-wrap gap-2">
            {(["SEND_NOW", "SCHEDULED", "RECURRING"] as Mode[]).map((value) => <button key={value} type="button" onClick={() => setMode(value)} className={cn(ghost, mode === value && "border-primary bg-primary-soft")}>{t(value === "SEND_NOW" ? "composer.sendNow" : value === "SCHEDULED" ? "composer.schedule" : "composer.recurring")}</button>)}
            {mode === "SCHEDULED" && <input className="rounded-xl border bg-white px-3 py-2 text-sm" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />}
            {mode === "RECURRING" && <><select className="rounded-xl border bg-white px-3 py-2 text-sm" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}><option value="DAILY">{t("composer.daily")}</option><option value="WEEKLY">{t("composer.weekly")}</option><option value="MONTHLY">{t("composer.monthly")}</option></select><input aria-label={t("composer.interval")} min={1} max={365} type="number" className="w-24 rounded-xl border bg-white px-3 py-2 text-sm" value={interval} onChange={(event) => setIntervalValue(Number(event.target.value))} /></>}
          </div>
        </section>
      </div>
      <section className={`${card} h-fit`}>
        <h3 className="text-sm font-semibold">{t("composer.summary")}</h3>
        <div className="my-5 rounded-xl bg-orange-50 p-4 text-sm leading-6">{text || t("composer.emptyPreview")}</div>
        <p className="mb-4 text-xs text-muted">{t("composer.targets", { count: resolved.size })}</p>
        <button disabled={!text || !resolved.size || (mode === "SCHEDULED" && !scheduledAt)} className={cn(primary, "w-full")} onClick={() => void send()}><Send className="size-4" />{t("composer.reviewSend")}</button>
        {status && <p className="mt-3 text-sm text-muted">{status}</p>}
      </section>
    </div>
  </>;
}
