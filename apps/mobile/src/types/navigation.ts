import type { NavigatorScreenParams } from "@react-navigation/native";

import type { AdminModuleKey } from "@/api/mobileAdmin";
import type { NotificationAdminTab } from "@/api/mobileNotificationAdmin";

export type AuthStackParamList = {
  Splash: undefined;
  Login: { invitationToken?: string; invitationCode?: string } | undefined;
  Register: { invitationToken?: string; invitationCode?: string } | undefined;
  ForgotPassword: undefined;
  ResetPassword: { identifier?: string } | undefined;
};

export type AppTabParamList = {
  Dashboard: undefined;
  WhatsApp: NavigatorScreenParams<WhatsAppStackParamList> | undefined;
  Groups: undefined;
  Messaging: undefined;
  MessageHistory: undefined;
  More: undefined;
  Categories: NavigatorScreenParams<CategoriesStackParamList> | undefined;
  Support: NavigatorScreenParams<SupportStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type WhatsAppStackParamList = {
  WhatsAppAccounts: undefined;
  WhatsAppQR: undefined;
  WhatsAppPhoneConnect: undefined;
};

export type CategoriesStackParamList = {
  CategoriesList: undefined;
  CategoryDetail: { categoryId: string };
};

export type SupportStackParamList = {
  SupportTickets: undefined;
  CreateTicket: undefined;
  TicketDetail: { ticketId: string };
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  CompanySettings: undefined;
  Subscription: undefined;
  Notifications: undefined;
  NotificationPreferences: undefined;
  NotificationPermissionEducation: undefined;
  Feedback: undefined;
  Settings: undefined;
  Security: undefined;
  PrivacyData: undefined;
  AccountDeletion: undefined;
  TeamUsers: undefined;
  AdminNotificationOperations: { initialTab?: NotificationAdminTab } | undefined;
  PlatformModule: { moduleKey: AdminModuleKey; title?: string; eyebrow?: string; description?: string; ticketId?: string };
};
