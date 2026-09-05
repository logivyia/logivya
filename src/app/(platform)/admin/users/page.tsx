import { AdminUsersPage } from "@/components/admin-users-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.users.read");
  return <AdminUsersPage canManage={hasAdminPermission(platformAdmin.role, platformAdmin.permissions, "admin.users.update")} />;
}
