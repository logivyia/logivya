import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  const subscription = await prisma.subscription.findFirst({ where: { companyId: context.company.id }, include: { plan: true }, orderBy: { createdAt: "desc" } });
  return <AppShell userName={context.user.name} subscription={subscription ? { planName: subscription.plan.name, status: subscription.status, trialEndsAt: subscription.trialEndsAt?.toISOString().slice(0,10) } : undefined}>{children}</AppShell>;
}
