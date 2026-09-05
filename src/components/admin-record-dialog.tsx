"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/provider";

export function AdminRecordDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }} className="m-auto max-h-[90dvh] w-[min(94vw,760px)] overflow-y-auto rounded-2xl border bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5"><h2 id={titleId} className="min-w-0 break-words text-xl font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label={t("common.close")} className="grid min-h-11 min-w-11 place-items-center rounded-xl border hover:bg-slate-50"><X className="size-5" /></button></header>
    <div className="p-5">{children}</div>
  </dialog>;
}
