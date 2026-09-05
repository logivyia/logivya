import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { IyzicoPaymentSettingsPage } from "@/components/iyzico-payment-settings-page";
import { getServerTranslator } from "@/i18n/server";
import { hasPermission } from "@/server/auth/permissions";
import { requireSession } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return {
    title: t("paymentProfile.title"),
    description: t("paymentProfile.description"),
  };
}

export default async function Page() {
  const { membership } = await requireSession();
  if (!hasPermission(membership.role, "manage_billing")) redirect("/settings/subscriptions");
  return <IyzicoPaymentSettingsPage />;
}
