import { AdminPrivacyCenter } from "@/components/admin-privacy-center";
import { getServerTranslator } from "@/i18n/server";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.privacy.read");
  const { locale } = await getServerTranslator();
  return <AdminPrivacyCenter locale={locale} canManage={hasAdminPermission(platformAdmin.role, platformAdmin.permissions, "admin.privacy.update")} />;
}
