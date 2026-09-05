"use client";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { AdminRecordDialog } from "./admin-record-dialog";

type Cell = string | number | null | undefined;
export function AdminInteractiveTable({ headers, rows, emptyLabel = "-" }: { headers: string[]; rows: Cell[][]; emptyLabel?: string }) {
  const { locale } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Cell[] | null>(null);
  const [sort, setSort] = useState<{ column: number; direction: number } | null>(null);
  const visible = useMemo(() => {
    const filtered = rows.filter(row => row.some(cell => String(cell ?? "").toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale))));
    return sort ? [...filtered].sort((a, b) => String(a[sort.column] ?? "").localeCompare(String(b[sort.column] ?? ""), locale, { numeric: true }) * sort.direction) : filtered;
  }, [rows, query, sort, locale]);
  const details = locale === "tr" ? "Ayrıntıları aç" : "Open details";
  return <section className="scroll-mt-24 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border px-3"><Search className="size-4 shrink-0 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} aria-label={locale === "tr" ? "Bu sayfadaki kayıtlarda ara" : "Search records on this page"} placeholder={locale === "tr" ? "Bu sayfadaki kayıtlarda ara…" : "Search this page…"} className="w-full min-w-0 bg-transparent py-2 text-sm outline-none" /></label><span role="status" className="text-xs text-slate-500">{visible.length} / {rows.length}</span></div>
    <div className="max-w-full overflow-x-auto max-md:hidden"><table className="w-full text-sm"><thead><tr className="border-b text-start text-xs text-slate-500">{headers.map((header, index) => <th key={header} scope="col" aria-sort={sort?.column === index ? sort.direction === 1 ? "ascending" : "descending" : "none"}><button type="button" className="min-h-11 py-3 pe-4 text-start font-semibold" onClick={() => setSort(current => ({ column: index, direction: current?.column === index ? -current.direction : 1 }))}>{header} {sort?.column === index ? sort.direction === 1 ? "↑" : "↓" : "↕"}</button></th>)}<th scope="col"><span className="sr-only">{details}</span></th></tr></thead><tbody>{visible.map((row, rowIndex) => <tr key={rowIndex} className="border-b transition-colors last:border-0 hover:bg-orange-50/50" onClick={() => setSelected(row)}>{row.map((cell, column) => <td key={column} className="max-w-xs break-words py-4 pe-4 align-top">{column === 0 ? <button type="button" className="text-start font-semibold text-slate-900 hover:text-orange-600" onClick={() => setSelected(row)}>{cell || details}</button> : cell ?? "-"}</td>)}<td><button type="button" onClick={() => setSelected(row)} aria-label={`${details}: ${row[0] ?? rowIndex + 1}`} className="grid size-10 place-items-center rounded-xl hover:bg-orange-100"><ChevronRight className="size-4" /></button></td></tr>)}</tbody></table></div>
    <div className="space-y-3 md:hidden">{visible.map((row, index) => <button key={index} type="button" onClick={() => setSelected(row)} className="flex w-full items-start gap-3 rounded-xl border p-4 text-start active:bg-orange-50"><div className="min-w-0 flex-1"><p className="break-words font-semibold">{row[0] || details}</p>{headers.slice(1, 4).map((label, column) => <p key={label} className="mt-1 break-words text-xs leading-5 text-slate-500">{label}: <span className="text-slate-700">{row[column + 1] ?? "-"}</span></p>)}</div><ChevronRight className="mt-1 size-4 shrink-0 text-orange-600" /></button>)}</div>
    {!visible.length ? <p role="status" className="py-10 text-center text-sm text-slate-500">{emptyLabel}</p> : null}
    <AdminRecordDialog open={Boolean(selected)} title={String(selected?.[0] || details)} onClose={() => setSelected(null)}><dl className="divide-y">{headers.map((label, index) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"><dt className="text-sm text-slate-500">{label}</dt><dd className="break-words text-sm font-medium">{selected?.[index] ?? "-"}</dd></div>)}</dl></AdminRecordDialog>
  </section>;
}
