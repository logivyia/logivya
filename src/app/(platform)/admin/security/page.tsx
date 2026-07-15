import { AdminSecurityCenter } from "@/components/admin-observability-centers";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("admin.security.read");
  return <AdminSecurityCenter />;
}
