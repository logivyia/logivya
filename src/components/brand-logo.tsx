import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-xl", dark && "bg-white px-3 py-2", className)}>
    <Image src="/logivya/logivya.png" alt="Logivya" width={1254} height={1254} className="h-auto w-full object-contain" priority />
  </span>;
}
