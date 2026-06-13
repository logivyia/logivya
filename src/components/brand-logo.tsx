import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { dark?: boolean; className?: string }) {
  return <Image
    src="/logivya/logo-transparent-v5.png"
    alt="Logivya"
    width={1161}
    height={433}
    priority
    className={cn("h-auto w-[170px] max-w-full object-contain", className)}
  />;
}
