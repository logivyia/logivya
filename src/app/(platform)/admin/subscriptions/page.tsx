import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { AdminSubscriptionsPage } from "@/components/admin-subscriptions-page";
export default async function Page(){await requirePlatformAdmin();return <AdminSubscriptionsPage/>}
