import { PrismaPg } from "@prisma/adapter-pg";
import { CompanyRole, PrismaClient } from "@prisma/client";
import { canonicalSubscriptionPlanCatalog } from "../src/config/subscription-plans";
import { TRIAL_DURATION_DAYS, trialEndsAt } from "../src/server/billing/trial-policy";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const planNames = {
  trial: "LOGIVYA 7 G\u00fcn \u00dccretsiz",
  starter: "LOGIVYA Plus",
  professional: "LOGIVYA Pro",
} as const;
const planDescriptions = {
  trial: "LOGIVYA'n\u0131n ileti\u015fim ve lojistik \u00f6zelliklerini 7 g\u00fcn boyunca \u00fccretsiz deneyin.",
  starter: "Canl\u0131 lojistik pazar\u0131, ilan, e\u015fle\u015ftirme ve ileti\u015fim operasyonlar\u0131 i\u00e7in 2 kullan\u0131c\u0131ya kadar eri\u015fim.",
  professional: "Geli\u015fmi\u015f lojistik, e\u015fle\u015ftirme ve ileti\u015fim operasyonlar\u0131 i\u00e7in 3 kullan\u0131c\u0131ya kadar eri\u015fim.",
} as const;
const unlimited = 2_147_483_647;
const plans = canonicalSubscriptionPlanCatalog().map((plan) => ({
  name: planNames[plan.slug],
  slug: plan.slug,
  description: planDescriptions[plan.slug],
  monthlyPrice: plan.monthlyPriceMinor / 100,
  yearlyPrice: plan.yearlyPriceMinor / 100,
  currency: plan.currency,
  trialDays: plan.slug === "trial" ? TRIAL_DURATION_DAYS : 0,
  maxWhatsappAccounts: plan.whatsappConnectionLimit,
  maxTeamUsers: plan.accountLimit,
  maxGroups: unlimited,
  maxMessagesPerDay: unlimited,
  maxMessagesPerMonth: unlimited,
  groupMessagingEnabled: plan.features.groupMessaging,
  contactMessagingEnabled: plan.features.contactMessaging,
  deleteForEveryoneEnabled: plan.features.deleteForEveryone,
  advertisingEnabled: plan.features.advertisingEnabled,
  hasScheduledMessages: plan.features.scheduledMessaging,
  hasRecurringMessages: plan.features.recurringMessaging,
  hasNoBranding: !plan.features.brandingFooter,
  advancedReportingEnabled: plan.slug === "professional",
  hasCrm: false,
  hasApi: false,
  isPopular: false,
  isCustom: false,
  isActive: plan.active,
}));
const rolePermissions: Record<CompanyRole, string[]> = {
  OWNER: ["view_dashboard", "manage_accounts", "connect_accounts", "disconnect_accounts", "archive_accounts", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "delete_campaigns", "view_message_history", "view_recipients", "manage_users", "manage_billing", "manage_company_settings", "manage_api_keys", "view_analytics", "export_data", "manage_webhooks", "view_audit_logs"],
  ADMIN: ["view_dashboard", "manage_accounts", "connect_accounts", "disconnect_accounts", "archive_accounts", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "delete_campaigns", "view_message_history", "view_recipients", "manage_users", "manage_company_settings", "manage_api_keys", "view_analytics", "export_data", "manage_webhooks", "view_audit_logs"],
  OPERATOR: ["view_dashboard", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "view_message_history", "view_recipients", "view_analytics"],
  VIEWER: ["view_dashboard", "view_message_history", "view_recipients", "view_analytics"],
};
async function main() {
  for (const plan of plans) await prisma.plan.upsert({ where: { slug: plan.slug }, update: plan, create: plan });
  await prisma.plan.updateMany({
    where: { slug: { notIn: plans.map((plan) => plan.slug) }, isActive: true },
    data: { isActive: false },
  });
  const legacySubscriptions=await prisma.subscription.findMany({where:{currentPeriodEndsAt:null},select:{id:true,status:true,createdAt:true,trialStartsAt:true,trialEndsAt:true}});
  for(const subscription of legacySubscriptions){
    const startsAt=subscription.trialStartsAt??subscription.createdAt;
    const endsAt=subscription.trialEndsAt??trialEndsAt(startsAt);
    await prisma.subscription.update({where:{id:subscription.id},data:{billingPeriod:subscription.status==="TRIALING"?"TRIAL":"CUSTOM",startsAt,endsAt,currentPeriodStartsAt:startsAt,currentPeriodEndsAt:endsAt,source:subscription.status==="TRIALING"?"TRIAL":"MANUAL_ADMIN",provider:"MANUAL"}});
  }
  for (const [role, codes] of Object.entries(rolePermissions) as [CompanyRole, string[]][]) {
    for (const code of codes) {
      const permission = await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: permission.id } },
        update: {},
        create: { role, permissionId: permission.id },
      });
    }
  }
}
main().finally(() => prisma.$disconnect());
