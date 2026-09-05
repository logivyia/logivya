import { AdminFeatureFlagsPage } from "@/components/admin-feature-flags-page";
import { hasAdminPermission } from "@/server/auth/admin-permissions";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";

export default async function Page() {
  const { platformAdmin } = await requirePlatformAdmin("admin.settings.read");
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });

  return <AdminFeatureFlagsPage canManage={hasAdminPermission(platformAdmin.role, platformAdmin.permissions, "admin.featureFlags.update")} initialFlags={flags.map((flag) => ({ key: flag.key, name: flag.name, description: flag.description ?? "", isEnabled: flag.isEnabled, rolloutPercentage: flag.rolloutPercentage }))} />;
}
