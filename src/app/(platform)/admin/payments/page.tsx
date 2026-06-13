import { AdminPaymentsPage } from "@/components/admin-payments-page";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("billing:manage");
  return <AdminPaymentsPage />;
}
