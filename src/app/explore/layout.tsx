import { Suspense, type ReactNode } from "react";
import { PublicMarketplaceShell } from "@/components/marketplace/public-marketplace-shell";
export default function ExploreLayout({ children }: { children: ReactNode }) { return <Suspense><PublicMarketplaceShell>{children}</PublicMarketplaceShell></Suspense>; }
