import { MobilePlatform } from "@prisma/client";
import { notFound } from "next/navigation";

import { TelegramManagementPage } from "@/components/telegram-management-page";
import { requireSession } from "@/server/auth/session";
import { resolveTelegramInternalAccess } from "@/server/telegram/access";

export const metadata = { title: "Telegram Yönetimi" };

export default async function Page() {
  const context = await requireSession();
  if (!(await resolveTelegramInternalAccess(context.user.id, MobilePlatform.WEB))) notFound();
  return <TelegramManagementPage />;
}
