import { AdminShell } from "@/components/admin-shell";
import { effectiveAdminPermissions } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { platformAdmin } = await requirePlatformAdmin();

  return (
    <AdminShell
      role={platformAdmin.role}
      permissions={effectiveAdminPermissions(platformAdmin.role, platformAdmin.permissions ?? [])}
    >
      {children}
    </AdminShell>
  );
}
