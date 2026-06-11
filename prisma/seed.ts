import { CompanyRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const plans = [
  { name: "Trial", slug: "trial", monthlyPrice: 0, yearlyPrice: 0, maxWhatsappAccounts: 1, maxGroups: 50, maxMessagesPerDay: 250, maxMessagesPerMonth: 1000 },
  { name: "Starter", slug: "starter", monthlyPrice: 39, yearlyPrice: 390, maxWhatsappAccounts: 2, maxGroups: 250, maxMessagesPerDay: 1000, maxMessagesPerMonth: 15000 },
  { name: "Professional", slug: "professional", monthlyPrice: 89, yearlyPrice: 890, maxWhatsappAccounts: 3, maxGroups: 1000, maxMessagesPerDay: 5000, maxMessagesPerMonth: 75000, hasScheduledMessages: true, hasRecurringMessages: true, hasNoBranding: true },
  { name: "Enterprise", slug: "enterprise", monthlyPrice: 0, yearlyPrice: 0, maxWhatsappAccounts: 100, maxGroups: 100000, maxMessagesPerDay: 100000, maxMessagesPerMonth: 1000000, hasScheduledMessages: true, hasRecurringMessages: true, hasNoBranding: true, hasCrm: true, hasApi: true },
];
const rolePermissions: Record<CompanyRole, string[]> = {
  OWNER: ["view_dashboard", "manage_accounts", "connect_accounts", "disconnect_accounts", "archive_accounts", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "delete_campaigns", "view_message_history", "view_recipients", "manage_users", "manage_billing", "manage_company_settings", "manage_api_keys", "view_analytics", "export_data", "manage_webhooks", "view_audit_logs"],
  ADMIN: ["view_dashboard", "manage_accounts", "connect_accounts", "disconnect_accounts", "archive_accounts", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "delete_campaigns", "view_message_history", "view_recipients", "manage_users", "manage_company_settings", "manage_api_keys", "view_analytics", "export_data", "manage_webhooks", "view_audit_logs"],
  OPERATOR: ["view_dashboard", "manage_groups", "manage_categories", "send_messages", "schedule_messages", "retry_campaigns", "cancel_campaigns", "view_message_history", "view_recipients", "view_analytics"],
  VIEWER: ["view_dashboard", "view_message_history", "view_recipients", "view_analytics"],
};
async function main() {
  for (const plan of plans) await prisma.plan.upsert({ where: { slug: plan.slug }, update: plan, create: plan });
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
