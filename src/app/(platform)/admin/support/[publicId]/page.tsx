import { AdminSupportPage } from "@/components/admin-support-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  const { platformAdmin } = await requirePlatformAdmin("admin.support.read");
  const { publicId } = await params;
  return <AdminSupportPage canManage={hasAdminPermission(platformAdmin.role, platformAdmin.permissions, "admin.support.update")} initialPublicId={publicId} />;
}
