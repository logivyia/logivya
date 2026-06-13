import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { dark?: boolean; className?: string }) {
  return <Image
    src="/logivya/logo-v3.jpeg"
    alt="Logivya"
    width={1180}
    height={449}
    priority
    className={cn("h-auto w-[170px] max-w-full object-contain", className)}
  />;
}
