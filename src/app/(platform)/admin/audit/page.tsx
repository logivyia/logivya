import { AdminAuditCenter } from "@/components/admin-observability-centers";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("admin.audit.read");
  return <AdminAuditCenter />;
}
