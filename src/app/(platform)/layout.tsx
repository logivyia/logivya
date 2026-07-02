import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/server/auth/session";
import { isAuthorizedLogivyaPlatformAdmin } from "@/server/auth/platform-owner";
import { subscriptionAccess } from "@/server/billing/subscription-access";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requireSession();
  const current = await subscriptionAccess.getCurrent(context.company.id);
  const subscription = current?.subscription ?? null;
  return <AppShell userName={context.user.name} isPlatformAdmin={isAuthorizedLogivyaPlatformAdmin({ email: context.user.email })} subscription={subscription ? { planName: subscription.plan.name, status: subscription.status, trialEndsAt: subscription.trialEndsAt?.toISOString(), currentPeriodEndsAt: subscription.currentPeriodEndsAt?.toISOString(), endsAt: subscription.endsAt?.toISOString() } : undefined}>{children}</AppShell>;
}
