import { UsersManagementPage } from "@/components/users-management-page";
import { requireSession } from "@/server/auth/session";
import { resolveMembershipAccess } from "@/server/team/membership-lifecycle";

export default async function Page() {
  const { company, user } = await requireSession();
  await resolveMembershipAccess(company.id, user.id);
  return <UsersManagementPage />;
}
