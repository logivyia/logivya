import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { AdminSubscriptionsPage } from "@/components/admin-subscriptions-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.billing.read");
  const can = (permission: string) =>
    hasAdminPermission(
      platformAdmin.role,
      platformAdmin.permissions,
      permission,
    );
  return (
    <AdminSubscriptionsPage
      canApprove={can("admin.subscriptions.approve")}
      canReject={can("admin.subscriptions.reject")}
    />
  );
}
