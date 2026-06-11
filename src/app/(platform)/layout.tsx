import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/server/auth/session";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  return <AppShell workspaceName={context.company.name} userName={context.user.name}>{children}</AppShell>;
}
