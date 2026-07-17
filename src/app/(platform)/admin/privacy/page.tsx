import { AdminPrivacyCenter } from "@/components/admin-privacy-center";
import { getServerTranslator } from "@/i18n/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";

export default async function Page() {
  await requirePlatformAdmin("admin.privacy.read");
  const { locale } = await getServerTranslator();
  return <AdminPrivacyCenter locale={locale} />;
}
