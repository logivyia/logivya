import { AdminSupportPage } from "@/components/admin-support-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.support.read");
  return <AdminSupportPage canManage={hasAdminPermission(platformAdmin.role, platformAdmin.permissions, "admin.support.update")} />;
}
