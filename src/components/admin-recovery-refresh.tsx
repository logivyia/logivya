"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function AdminRecoveryRefresh({ tr }: { tr: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(() => router.refresh())} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm disabled:opacity-50" aria-live="polite"><RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />{pending ? (tr ? "Yenileniyor…" : "Refreshing…") : (tr ? "Durumu yenile" : "Refresh status")}</button>;
}
