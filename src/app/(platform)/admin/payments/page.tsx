import { AdminPaymentsPage } from "@/components/admin-payments-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.payments.read");
  return <AdminPaymentsPage canConfirm={hasAdminPermission(platformAdmin.role, platformAdmin.permissions, "admin.payments.confirm")} />;
}
