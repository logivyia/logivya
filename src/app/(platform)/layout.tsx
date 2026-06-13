import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/db";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  const [subscription, platformAdmin] = await Promise.all([
    prisma.subscription.findFirst({ where: { companyId: context.company.id }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
    prisma.platformAdmin.findUnique({ where: { userId: context.user.id }, select: { role: true, isActive: true } }),
  ]);
  return <AppShell userName={context.user.name} isPlatformAdmin={platformAdmin?.isActive === true && platformAdmin.role === "SUPER_ADMIN"} subscription={subscription ? { planName: subscription.plan.name, status: subscription.status, trialEndsAt: subscription.trialEndsAt?.toISOString(),currentPeriodEndsAt:subscription.currentPeriodEndsAt?.toISOString() } : undefined}>{children}</AppShell>;
}
