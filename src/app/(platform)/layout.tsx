import { AppShell } from "@/components/app-shell";
import { MobilePlatform } from "@prisma/client";
import { requireSession } from "@/server/auth/session";
import { getPlatformAdminProfile } from "@/server/auth/platform-admin";
import { subscriptionAccess } from "@/server/billing/subscription-access";
import { resolveFacebookPagesAccess } from "@/server/facebook/access";
import { resolveFreightMarketplaceAccess } from "@/server/freight/access";
import { logger } from "@/server/observability/logger";
import { resolveTelegramInternalAccess } from "@/server/telegram/access";
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireSession();
  const [current, telegram, facebook, freight, platformAdmin] =
    await Promise.all([
      subscriptionAccess.getCurrent(context.company.id).catch((error) => {
        logger.error("platform.layout.subscription_lookup_failed", error, {
          userId: context.user.id,
          companyId: context.company.id,
        });
        return null;
      }),
      resolveTelegramInternalAccess(context.user.id, MobilePlatform.WEB),
      resolveFacebookPagesAccess(context.user.id, MobilePlatform.WEB),
      resolveFreightMarketplaceAccess(context.user.id),
      getPlatformAdminProfile({
        userId: context.user.id,
        email: context.user.email,
      }),
    ]);
  const subscription = current?.subscription ?? null;
  return (
    <AppShell
      userName={context.user.name}
      memberRole={context.membership.role}
      isPlatformAdmin={platformAdmin.isPlatformAdmin}
      featureAvailability={{ telegram, facebook, freight: freight.enabled }}
      subscription={
        subscription
          ? {
              planName: subscription.plan.name,
              status: subscription.status,
              trialEndsAt: subscription.trialEndsAt?.toISOString(),
              currentPeriodEndsAt:
                subscription.currentPeriodEndsAt?.toISOString(),
              endsAt: subscription.endsAt?.toISOString(),
            }
          : undefined
      }
    >
      {children}
    </AppShell>
  );
}
