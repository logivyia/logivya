import { AdminSecurityCenter } from "@/components/admin-observability-centers";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.security.read");
  return <AdminSecurityCenter canManage={hasAdminPermission(platformAdmin.role, platformAdmin.permissions, "admin.security.update")} />;
}
