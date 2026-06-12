import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  const subscription = await prisma.subscription.findFirst({ where: { companyId: context.company.id }, include: { plan: true }, orderBy: { createdAt: "desc" } });
  const admins=(process.env.PLATFORM_ADMIN_EMAILS??"").split(",").map(x=>x.trim().toLowerCase());
  return <AppShell userName={context.user.name} isPlatformAdmin={admins.includes(context.user.email.toLowerCase())} subscription={subscription ? { planName: subscription.plan.name, status: subscription.status, trialEndsAt: subscription.trialEndsAt?.toISOString(),currentPeriodEndsAt:subscription.currentPeriodEndsAt?.toISOString() } : undefined}>{children}</AppShell>;
}
