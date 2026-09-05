"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { AdminRecordDialog } from "./admin-record-dialog";

export function AdminMetricCard({ label, value, href, onClick, children, description, recordsAvailable = false }: { label: string; value: string | number; href?: string; onClick?: () => void; children?: ReactNode; description?: string; recordsAvailable?: boolean }) {
  const [open, setOpen] = useState(false);
  const { locale } = useI18n();
  const className = "group relative block w-full min-w-0 rounded-2xl border bg-white p-4 text-start shadow-sm transition hover:border-orange-300 hover:shadow-md focus-visible:ring-4 focus-visible:ring-orange-200 sm:p-5";
  const body = <><div className="mb-3 flex items-start justify-between gap-3">{children}<ArrowUpRight aria-hidden className="ms-auto size-4 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div><p className="break-words text-xs leading-5 text-slate-500">{label}</p><p className="mt-1 break-words text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p></>;
  return <>{href ? <Link href={href} className={className}>{body}</Link> : <button type="button" className={className} onClick={onClick ?? (() => setOpen(true))}>{body}</button>}<AdminRecordDialog open={open} title={label} onClose={() => setOpen(false)}><p className="text-3xl font-semibold">{value}</p>{description ? <p className="mt-4 text-sm leading-6 text-slate-500">{description}</p> : null}{recordsAvailable ? <button type="button" className="mt-5 min-h-11 rounded-xl border px-4 text-sm font-medium" onClick={() => { setOpen(false); document.getElementById("admin-records")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); }}>{locale === "tr" ? "Kayıtları incele" : "Review records"}</button> : null}</AdminRecordDialog></>;
}
