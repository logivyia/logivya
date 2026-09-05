import { AdminCompaniesPage } from "@/components/admin-companies-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.companies.read");
  const can = (permission: string) =>
    hasAdminPermission(
      platformAdmin.role,
      platformAdmin.permissions,
      permission,
    );
  return (
    <AdminCompaniesPage
      canManage={can("admin.companies.update")}
      canReadUsers={can("admin.users.read")}
      canReadBilling={can("admin.billing.read")}
      canReadWhatsApp={can("admin.whatsapp.read")}
    />
  );
}
