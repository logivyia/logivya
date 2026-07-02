import { AdminSupportPage } from "@/components/admin-support-page";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin();
  return <AdminSupportPage />;
}
