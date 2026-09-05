import { MobilePlatform } from "@prisma/client";
import { notFound } from "next/navigation";

import { FacebookManagementPage } from "@/components/facebook-management-page";
import { requireSession } from "@/server/auth/session";
import { resolveFacebookPagesAccess } from "@/server/facebook/access";

export const metadata = { title: "Facebook Yönetimi" };

export default async function Page() {
  const context = await requireSession();
  if (!(await resolveFacebookPagesAccess(context.user.id, MobilePlatform.WEB))) notFound();
  return <FacebookManagementPage />;
}
