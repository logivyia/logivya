export type SupportedPlatform = "desktopWeb" | "mobileWeb" | "android" | "ios";
export type FeatureParityStatus = "implemented" | "partial" | "planned" | "platformSpecific";

export type PlatformFeatureParity = {
  id: string;
  title: string;
  status: FeatureParityStatus;
  businessLogicOwner: "backend";
  platforms: Record<SupportedPlatform, FeatureParityStatus>;
  permissions: string[];
  webRoutes: string[];
  webFiles: string[];
  mobileRoutes: string[];
  mobileFiles: string[];
  apiFiles: string[];
  realtimeSync: "polling" | "push-ready" | "manual-refresh" | "not-applicable";
  notes?: string;
};

export const supportedPlatforms: readonly SupportedPlatform[] = ["desktopWeb", "mobileWeb", "android", "ios"] as const;

export const platformFeatureRegistry = [
  {
    id: "dashboard",
    title: "Dashboard and workspace summary",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["view_dashboard"],
    webRoutes: ["/dashboard"],
    webFiles: ["src/app/(platform)/dashboard/page.tsx"],
    mobileRoutes: ["Dashboard"],
    mobileFiles: ["apps/mobile/src/screens/app/dashboard-screen.tsx"],
    apiFiles: ["src/app/api/dashboard/summary/route.ts", "src/app/api/mobile/bootstrap/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "auth_session",
    title: "Authentication, password recovery, and session synchronization",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: [],
    webRoutes: ["/login", "/register", "/forgot-password", "/reset-password"],
    webFiles: ["src/components/auth-form.tsx", "src/app/login/page.tsx", "src/app/register/page.tsx"],
    mobileRoutes: ["Login", "Register", "ForgotPassword", "ResetPassword"],
    mobileFiles: [
      "apps/mobile/src/screens/auth/login-screen.tsx",
      "apps/mobile/src/screens/auth/register-screen.tsx",
      "apps/mobile/src/screens/auth/forgot-password-screen.tsx",
      "apps/mobile/src/screens/auth/reset-password-screen.tsx",
      "apps/mobile/src/auth/auth-service.ts"
    ],
    apiFiles: [
      "src/app/api/auth/login/route.ts",
      "src/app/api/auth/register/route.ts",
      "src/app/api/auth/forgot-password/route.ts",
      "src/app/api/mobile/auth/login/route.ts",
      "src/app/api/mobile/auth/register/route.ts",
      "src/app/api/mobile/auth/refresh/route.ts",
      "src/server/mobile/auth.ts"
    ],
    realtimeSync: "not-applicable",
    notes: "Session authority, password validation, token refresh, and user identity normalization remain backend-owned across web and mobile."
  },
  {
    id: "whatsapp_connection",
    title: "WhatsApp account connection and status",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["manage_accounts", "connect_accounts"],
    webRoutes: ["/accounts"],
    webFiles: ["src/app/(platform)/accounts/page.tsx"],
    mobileRoutes: ["WhatsApp", "WhatsAppAccounts"],
    mobileFiles: ["apps/mobile/src/screens/app/whatsapp-screen.tsx", "apps/mobile/src/navigation/whatsapp-navigator.tsx"],
    apiFiles: ["src/app/api/accounts/route.ts", "src/app/api/mobile/whatsapp/accounts/route.ts", "src/app/api/mobile/whatsapp/status/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "qr_pairing",
    title: "WhatsApp QR pairing",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["connect_accounts"],
    webRoutes: ["/accounts"],
    webFiles: ["src/app/(platform)/accounts/page.tsx"],
    mobileRoutes: ["WhatsAppQR"],
    mobileFiles: ["apps/mobile/src/screens/app/whatsapp-qr-screen.tsx"],
    apiFiles: ["src/app/api/accounts/connect/qr/route.ts", "src/app/api/mobile/whatsapp/accounts/qr/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "phone_code_pairing",
    title: "WhatsApp phone code pairing",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["connect_accounts"],
    webRoutes: ["/accounts"],
    webFiles: ["src/app/(platform)/accounts/page.tsx"],
    mobileRoutes: ["WhatsAppPhoneConnect"],
    mobileFiles: ["apps/mobile/src/screens/app/whatsapp-phone-connect-screen.tsx"],
    apiFiles: ["src/app/api/accounts/connect/pairing-code/route.ts", "src/app/api/mobile/whatsapp/accounts/phone-code/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "group_synchronization",
    title: "Group synchronization",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["manage_groups"],
    webRoutes: ["/groups"],
    webFiles: ["src/app/(platform)/groups/page.tsx"],
    mobileRoutes: ["Groups"],
    mobileFiles: ["apps/mobile/src/screens/app/groups-screen.tsx"],
    apiFiles: ["src/app/api/mobile/groups/route.ts", "src/app/api/accounts/whatsapp/[id]/sync-groups/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "category_management",
    title: "Category management",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["manage_categories"],
    webRoutes: ["/categories"],
    webFiles: ["src/app/(platform)/categories/page.tsx"],
    mobileRoutes: ["Categories", "CategoryDetail"],
    mobileFiles: ["apps/mobile/src/screens/app/categories-screen.tsx", "apps/mobile/src/screens/app/category-detail-screen.tsx"],
    apiFiles: ["src/app/api/categories/route.ts", "src/app/api/mobile/categories/route.ts", "src/app/api/mobile/categories/[id]/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "campaign_messaging",
    title: "Campaign messaging",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["send_messages"],
    webRoutes: ["/send-message"],
    webFiles: ["src/app/(platform)/send-message/page.tsx"],
    mobileRoutes: ["Messaging"],
    mobileFiles: ["apps/mobile/src/screens/app/messaging-screen.tsx"],
    apiFiles: ["src/app/api/messages/campaigns/route.ts", "src/app/api/mobile/messages/send/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "scheduled_messaging",
    title: "Scheduled messaging",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["schedule_messages"],
    webRoutes: ["/send-message", "/message-history"],
    webFiles: ["src/app/(platform)/send-message/page.tsx", "src/app/(platform)/message-history/page.tsx"],
    mobileRoutes: ["Messaging", "MessageHistory"],
    mobileFiles: ["apps/mobile/src/screens/app/messaging-screen.tsx", "apps/mobile/src/screens/app/message-history-screen.tsx"],
    apiFiles: ["src/app/api/mobile/messages/schedule/route.ts", "src/server/queues/recurring.ts"],
    realtimeSync: "polling"
  },
  {
    id: "message_history",
    title: "Message history and campaign results",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["view_message_history"],
    webRoutes: ["/message-history"],
    webFiles: ["src/app/(platform)/message-history/page.tsx"],
    mobileRoutes: ["MessageHistory"],
    mobileFiles: ["apps/mobile/src/screens/app/message-history-screen.tsx"],
    apiFiles: ["src/app/api/mobile/messages/history/route.ts", "src/app/api/messages/campaigns/[id]/recipients/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "company_settings",
    title: "Profile information",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["manage_company_settings"],
    webRoutes: ["/settings/company"],
    webFiles: ["src/app/(platform)/settings/company/page.tsx"],
    mobileRoutes: ["CompanySettings"],
    mobileFiles: ["apps/mobile/src/screens/app/company-settings-screen.tsx"],
    apiFiles: ["src/app/api/settings/company/route.ts", "src/app/api/mobile/company/profile/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "subscription_management",
    title: "Subscription and plan management",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["manage_billing"],
    webRoutes: ["/settings/subscriptions"],
    webFiles: ["src/app/(platform)/settings/subscriptions/page.tsx"],
    mobileRoutes: ["Subscription"],
    mobileFiles: ["apps/mobile/src/screens/app/subscription-screen.tsx"],
    apiFiles: ["src/app/api/settings/subscriptions/route.ts", "src/app/api/mobile/subscription/status/route.ts", "src/server/billing/subscription-access.ts"],
    realtimeSync: "polling"
  },
  {
    id: "team_management",
    title: "Team management and invitations",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["manage_users"],
    webRoutes: ["/settings/users"],
    webFiles: ["src/app/(platform)/settings/users/page.tsx"],
    mobileRoutes: ["TeamUsers"],
    mobileFiles: ["apps/mobile/src/screens/app/team-users-screen.tsx", "apps/mobile/src/api/mobileTeam.ts"],
    apiFiles: ["src/app/api/settings/users/route.ts", "src/app/api/mobile/team/users/route.ts", "src/app/api/mobile/team/users/[id]/route.ts"],
    realtimeSync: "polling",
    notes: "Web and Android now share the backend company-user service for invite, role, status, rename, password reset, and removal workflows."
  },
  {
    id: "support_center",
    title: "Support center",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: [],
    webRoutes: ["/support"],
    webFiles: ["src/app/(platform)/support/page.tsx"],
    mobileRoutes: ["SupportTickets", "CreateTicket", "TicketDetail"],
    mobileFiles: ["apps/mobile/src/screens/app/support-screen.tsx", "apps/mobile/src/screens/app/create-ticket-screen.tsx", "apps/mobile/src/screens/app/ticket-detail-screen.tsx"],
    apiFiles: ["src/app/api/support/tickets/route.ts", "src/app/api/mobile/support/tickets/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "notifications",
    title: "Notifications",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: [],
    webRoutes: ["/dashboard"],
    webFiles: ["src/components/app-shell.tsx"],
    mobileRoutes: ["Notifications"],
    mobileFiles: ["apps/mobile/src/screens/app/notifications-screen.tsx"],
    apiFiles: ["src/app/api/notifications/route.ts", "src/app/api/mobile/notifications/route.ts"],
    realtimeSync: "polling"
  },
  {
    id: "admin_panel",
    title: "Admin panel",
    status: "partial",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "partial", ios: "planned" },
    permissions: ["view_audit_logs", "manage_users", "manage_billing"],
    webRoutes: ["/admin"],
    webFiles: ["src/app/(platform)/admin/page.tsx", "src/app/(platform)/admin/layout.tsx"],
    mobileRoutes: ["More", "PlatformModule"],
    mobileFiles: ["apps/mobile/src/screens/app/more-screen.tsx", "apps/mobile/src/screens/app/platform-module-screen.tsx"],
    apiFiles: ["src/app/api/admin/dashboard/route.ts", "src/app/api/admin/companies/route.ts", "src/app/api/admin/users/route.ts"],
    realtimeSync: "manual-refresh",
    notes: "Android has module coverage and live API summaries; dedicated admin detail workflows are tracked as parity work."
  },
  {
    id: "analytics_reports_audit",
    title: "Analytics, reports, and audit logs",
    status: "partial",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "partial", ios: "planned" },
    permissions: ["view_analytics", "view_audit_logs", "export_data"],
    webRoutes: ["/admin/metrics", "/admin/audit", "/activity"],
    webFiles: ["src/app/(platform)/admin/metrics/page.tsx", "src/app/(platform)/admin/audit/page.tsx", "src/app/(platform)/activity/page.tsx"],
    mobileRoutes: ["PlatformModule:metrics", "PlatformModule:audit"],
    mobileFiles: ["apps/mobile/src/screens/app/platform-module-screen.tsx"],
    apiFiles: ["src/app/api/admin/metrics/route.ts", "src/app/api/admin/activity/route.ts"],
    realtimeSync: "manual-refresh",
    notes: "Mobile exposes summary/detail rows from admin APIs; chart-level report parity is still planned."
  },
  {
    id: "billing_lifecycle",
    title: "Billing lifecycle",
    status: "partial",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "partial", ios: "planned" },
    permissions: ["manage_billing"],
    webRoutes: ["/settings/subscriptions", "/admin/billing", "/admin/payments", "/admin/invoices"],
    webFiles: [
      "src/app/(platform)/settings/subscriptions/page.tsx",
      "src/app/(platform)/admin/billing/page.tsx",
      "src/app/(platform)/admin/payments/page.tsx",
      "src/app/(platform)/admin/invoices/page.tsx"
    ],
    mobileRoutes: ["Subscription", "PlatformModule:billing"],
    mobileFiles: ["apps/mobile/src/screens/app/subscription-screen.tsx", "apps/mobile/src/screens/app/platform-module-screen.tsx"],
    apiFiles: ["src/app/api/billing/plans/route.ts", "src/app/api/billing/request-upgrade/route.ts", "src/app/api/admin/payments/route.ts"],
    realtimeSync: "polling",
    notes: "Payment-provider checkout remains backend/web-led; mobile can request upgrades and view subscription state."
  },
  {
    id: "profile_management",
    title: "Profile management",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: [],
    webRoutes: ["/settings"],
    webFiles: ["src/app/(platform)/settings/page.tsx"],
    mobileRoutes: ["Profile"],
    mobileFiles: ["apps/mobile/src/screens/app/profile-screen.tsx", "apps/mobile/src/features/profile/profileStore.ts"],
    apiFiles: ["src/app/api/auth/me/route.ts", "src/app/api/mobile/auth/me/route.ts"],
    realtimeSync: "polling",
    notes: "Profile identity is read from the same backend session/user model; clients do not own role or account state."
  },
  {
    id: "settings_and_account_controls",
    title: "Settings and account controls",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["manage_company_settings", "manage_users", "manage_billing"],
    webRoutes: ["/settings", "/settings/company", "/settings/users", "/settings/subscriptions", "/settings/delete-account"],
    webFiles: [
      "src/app/(platform)/settings/page.tsx",
      "src/app/(platform)/settings/company/page.tsx",
      "src/app/(platform)/settings/users/page.tsx",
      "src/app/(platform)/settings/subscriptions/page.tsx",
      "src/app/(platform)/settings/delete-account/page.tsx"
    ],
    mobileRoutes: ["Settings", "CompanySettings", "TeamUsers", "Subscription", "AccountDeletion"],
    mobileFiles: [
      "apps/mobile/src/screens/app/settings-screen.tsx",
      "apps/mobile/src/screens/app/company-settings-screen.tsx",
      "apps/mobile/src/screens/app/team-users-screen.tsx",
      "apps/mobile/src/screens/app/subscription-screen.tsx",
      "apps/mobile/src/screens/app/account-deletion-screen.tsx"
    ],
    apiFiles: [
      "src/app/api/settings/company/route.ts",
      "src/app/api/settings/users/route.ts",
      "src/app/api/settings/subscriptions/route.ts",
      "src/app/api/settings/delete-account/route.ts",
      "src/app/api/mobile/company/profile/route.ts",
      "src/app/api/mobile/team/users/route.ts",
      "src/app/api/mobile/subscription/status/route.ts",
      "src/app/api/mobile/account/delete/route.ts"
    ],
    realtimeSync: "polling",
    notes: "Settings screens may be arranged differently on small devices, but permissions and mutations are enforced by shared backend endpoints."
  },
  {
    id: "feedback",
    title: "Feedback submission",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: [],
    webRoutes: ["/support"],
    webFiles: ["src/app/(platform)/support/page.tsx"],
    mobileRoutes: ["Feedback"],
    mobileFiles: ["apps/mobile/src/screens/app/feedback-screen.tsx"],
    apiFiles: ["src/app/api/mobile/feedback/route.ts", "src/app/api/support/tickets/route.ts"],
    realtimeSync: "manual-refresh",
    notes: "Feedback is treated as a lightweight support intake path and must continue to feed backend-owned support operations."
  },
  {
    id: "recurring_messaging",
    title: "Recurring messaging",
    status: "implemented",
    businessLogicOwner: "backend",
    platforms: { desktopWeb: "implemented", mobileWeb: "implemented", android: "implemented", ios: "planned" },
    permissions: ["schedule_messages"],
    webRoutes: ["/send-message"],
    webFiles: ["src/app/(platform)/send-message/page.tsx", "src/components/campaign-composer-page.tsx"],
    mobileRoutes: ["Messaging"],
    mobileFiles: ["apps/mobile/src/screens/app/messaging-screen.tsx", "apps/mobile/src/api/mobileMessages.ts"],
    apiFiles: ["src/app/api/campaigns/route.ts", "src/app/api/mobile/messages/send/route.ts", "src/server/messages/delivery-pipeline.ts", "src/server/queues/recurring.ts", "src/worker/index.ts"],
    realtimeSync: "polling",
    notes: "Recurring campaigns use the shared backend delivery pipeline and worker queue on desktop web, mobile web, and Android."
  }
] as const satisfies readonly PlatformFeatureParity[];

export function getImplementedPlatformFeatures() {
  return platformFeatureRegistry.filter((feature) => feature.status === "implemented");
}

export function getParityGaps() {
  return (platformFeatureRegistry as readonly PlatformFeatureParity[]).filter((feature) => feature.status === "partial" || feature.status === "planned");
}
