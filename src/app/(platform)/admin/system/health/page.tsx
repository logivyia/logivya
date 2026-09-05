import { SystemHealthPage } from "@/components/operations-pages";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin(
    "admin.systemHealth.read",
  );
  return (
    <SystemHealthPage
      canManage={hasAdminPermission(
        platformAdmin.role,
        platformAdmin.permissions,
        "admin.incidents.update",
      )}
    />
  );
}
