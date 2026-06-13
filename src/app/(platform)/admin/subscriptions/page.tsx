import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { AdminSubscriptionsPage } from "@/components/admin-subscriptions-page";

export default async function Page() {
  await requirePlatformAdmin("admin.subscriptions.approve");
  return <AdminSubscriptionsPage />;
}
