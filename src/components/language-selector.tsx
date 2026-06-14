"use client";

import { ChevronDown, Languages } from "lucide-react";
import { useState } from "react";
import { locales, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export function LanguageSelector({ dark = false }: { dark?: boolean }) {
  const { locale, localeNames, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  return <div className="relative">
    <button className={cn("flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold", dark ? "border-white/15 bg-white/5 text-white" : "bg-card")} onClick={() => setOpen(!open)}>
      <Languages className="size-4" />{locale.toUpperCase()}<ChevronDown className="size-3 opacity-60" />
    </button>
    {open && <div className="absolute end-0 top-11 z-[120] max-h-80 w-52 overflow-auto rounded-xl border bg-white p-2 text-slate-900 shadow-2xl">
      {locales.map((item) => <button key={item} onClick={() => { void setLocale(item as Locale); setOpen(false); }} className={cn("block w-full rounded-lg px-3 py-2 text-start text-xs hover:bg-orange-50", locale === item && "bg-orange-50 font-semibold text-orange-600")}>{localeNames[item]}</button>)}
    </div>}
  </div>;
}
