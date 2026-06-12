import { cn } from "@/lib/utils";

export function BrandLogo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return <span aria-label="Logivya" className={cn("inline-flex h-9 items-center font-sans text-xl font-black tracking-[.22em]", dark ? "text-white" : "text-slate-950", className)}>
    LOGIVYA
  </span>;
}
