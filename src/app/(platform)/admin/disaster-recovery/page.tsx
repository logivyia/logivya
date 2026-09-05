import { AdminRecoveryOverview } from "@/components/admin-recovery-overview";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("admin.backups.read");
  const { locale } = await getServerTranslator();
  return <AdminRecoveryOverview tr={locale === "tr"} recovery />;
}
