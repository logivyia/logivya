import type { Metadata } from "next";
import { Mail, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { getServerTranslator } from "@/i18n/server";
import { requireSession } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator();
  return { title: t("settings.profile"), description: t("settings.profileDescription") };
}

export default async function ProfileSettingsPage() {
  const [{ t }, { user, membership }] = await Promise.all([getServerTranslator(), requireSession()]);
  const roleKey = `users.${membership.role.toLowerCase()}`;

  return (
    <main>
      <header className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-primary">{t("settings.managementEyebrow")}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t("settings.profile")}</h1>
        <p className="mt-2 text-sm text-muted">{t("settings.profileDescription")}</p>
      </header>
      <section className="grid gap-4 rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:grid-cols-3">
        <ProfileFact icon={<UserRound aria-hidden className="size-5 text-primary" />} label={t("settings.profileName")} value={user.name} />
        <ProfileFact icon={<Mail aria-hidden className="size-5 text-primary" />} label={t("settings.profileEmail")} value={user.email} />
        <ProfileFact icon={<ShieldCheck aria-hidden className="size-5 text-primary" />} label={t("settings.profileRole")} value={t(roleKey)} />
      </section>
    </main>
  );
}

function ProfileFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      {icon}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
