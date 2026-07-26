import { PrismaPg } from "@prisma/adapter-pg";
import { CompanyRole, PrismaClient } from "@prisma/client";
import { TRIAL_DURATION_DAYS, trialEndsAt } from "../src/server/billing/trial-policy";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const plans = [
  { name: "Deneme", slug: "trial", description:"İlk kayıt olan kullanıcılar için 7 günlük ücretsiz deneme.", monthlyPrice: 0, yearlyPrice: 0, currency:"TRY",trialDays:TRIAL_DURATION_DAYS,maxWhatsappAccounts: 1,maxTeamUsers:1,maxGroups:2147483647,maxMessagesPerDay:2147483647,maxMessagesPerMonth:2147483647,groupMessagingEnabled:true,contactMessagingEnabled:true,deleteForEveryoneEnabled:true,advertisingEnabled:true,hasScheduledMessages:true,hasRecurringMessages:true },
  { name: "Başlangıç", slug: "starter", description:"Küçük işletmeler ve bireysel kullanıcılar için.",monthlyPrice:280,yearlyPrice:3600,currency:"TRY",maxWhatsappAccounts:2,maxTeamUsers:2,maxGroups:2147483647,maxMessagesPerDay:2147483647,maxMessagesPerMonth:2147483647,groupMessagingEnabled:true,contactMessagingEnabled:true,deleteForEveryoneEnabled:true,advertisingEnabled:true,hasScheduledMessages:true,hasRecurringMessages:true,hasNoBranding:false },
  { name: "Profesyonel", slug: "professional",description:"Profesyonel ekipler ve yoğun kullanım için.",monthlyPrice:380,yearlyPrice:4500,currency:"TRY",maxWhatsappAccounts:3,maxTeamUsers:3,maxGroups:2147483647,maxMessagesPerDay:2147483647,maxMessagesPerMonth:2147483647,groupMessagingEnabled:true,contactMessagingEnabled:true,deleteForEveryoneEnabled:true,advertisingEnabled:false,hasScheduledMessages:true,hasRecurringMessages:true,hasNoBranding:true,advancedReportingEnabled:true,isPopular:true },
  { name: "Kurumsal", slug: "enterprise",description:"Kurumsal firmalar ve yüksek hacimli operasyonlar için.",monthlyPrice:0,yearlyPrice:0,currency:"TRY",maxWhatsappAccounts:2147483647,maxTeamUsers:2147483647,maxGroups:2147483647,maxMessagesPerDay:2147483647,maxMessagesPerMonth:2147483647,groupMessagingEnabled:true,contactMessagingEnabled:true,deleteForEveryoneEnabled:true,hasScheduledMessages:true,hasRecurringMessages:true,hasNoBranding:true,advancedReportingEnabled:true,hasCrm:true,hasApi:true,isCustom:true },
];
const rolePermissions: Record<CompanyRole, string[]> = {
  OWNER: ["view_dashboard", "manage_accounts", "connect_accounts", "disconnect_accounts", "archive_accounts", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "delete_campaigns", "view_message_history", "view_recipients", "manage_users", "manage_billing", "manage_company_settings", "manage_api_keys", "view_analytics", "export_data", "manage_webhooks", "view_audit_logs"],
  ADMIN: ["view_dashboard", "manage_accounts", "connect_accounts", "disconnect_accounts", "archive_accounts", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "delete_campaigns", "view_message_history", "view_recipients", "manage_users", "manage_company_settings", "manage_api_keys", "view_analytics", "export_data", "manage_webhooks", "view_audit_logs"],
  OPERATOR: ["view_dashboard", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "view_message_history", "view_recipients", "view_analytics"],
  VIEWER: ["view_dashboard", "view_message_history", "view_recipients", "view_analytics"],
};
async function main() {
  for (const plan of plans) await prisma.plan.upsert({ where: { slug: plan.slug }, update: plan, create: plan });
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
