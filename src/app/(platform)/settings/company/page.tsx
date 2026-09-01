import type { Metadata } from "next";
import { CompanySettingsPage } from "@/components/company-settings-page";
import { getServerTranslator } from "@/i18n/server";
import { hasPermission } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    title: t("settings.company"),
    description: t("company.description"),
  };
}

export default async function Page() {
  const { membership } = await requireSession();
  return <CompanySettingsPage canEdit={hasPermission(membership.role, "manage_company_settings")} />;
}
