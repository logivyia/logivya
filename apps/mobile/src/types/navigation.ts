import type { NavigatorScreenParams } from "@react-navigation/native";

import type { AdminModuleKey } from "@/api/mobileAdmin";
import type { NotificationAdminTab } from "@/api/mobileNotificationAdmin";
import type { LogisticsSector, MarketplaceScope } from "@/api/mobileFreight";

export type AdminNotificationOperationsParams = {
  initialTab?: NotificationAdminTab;
};

export type AuthStackParamList = {
  Splash: undefined;
  Login: { invitationToken?: string; invitationCode?: string } | undefined;
  Register: { invitationToken?: string; invitationCode?: string } | undefined;
  ForgotPassword: undefined;
  ResetPassword: { identifier?: string } | undefined;
};

export type AppTabParamList = {
  Dashboard: undefined;
  HomeMoving: undefined;
  PartialLoad: undefined;
  HeavyHaul: undefined;
  CreateLoad: NavigatorScreenParams<CreateLoadStackParamList> | undefined;
  FindLoads: NavigatorScreenParams<FindLoadsStackParamList> | undefined;
  VehicleMarketplace:
    NavigatorScreenParams<VehicleMarketplaceStackParamList> | undefined;
  DriverMarketplace:
    NavigatorScreenParams<DriverMarketplaceStackParamList> | undefined;
  MyListings: NavigatorScreenParams<MyListingsStackParamList> | undefined;
  DemandRequests: NavigatorScreenParams<DemandRequestStackParamList> | undefined;
  WhatsApp: NavigatorScreenParams<WhatsAppStackParamList> | undefined;
  Telegram: undefined;
  FacebookPages: undefined;
  Groups: { initialPlatform?: "WHATSAPP" | "TELEGRAM" } | undefined;
  Messaging: { initialPlatform?: "WHATSAPP" | "TELEGRAM" } | undefined;
  MessageHistory: { initialPlatform?: "WHATSAPP" | "TELEGRAM" } | undefined;
  More: NavigatorScreenParams<MoreStackParamList> | undefined;
  Categories: NavigatorScreenParams<CategoriesStackParamList> | undefined;
  Support: NavigatorScreenParams<SupportStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type CreateLoadStackParamList = {
  CreateLoadHome: { sector?: LogisticsSector } | undefined;
};

export type FindLoadsStackParamList = {
  FindLoadsHome: { initialQuery?: string; scope?: MarketplaceScope } | undefined;
  FreightDetails: { listingId: string; requestId?: string };
};

export type VehicleMarketplaceStackParamList = {
  VehicleSearch: { initialQuery?: string; scope?: MarketplaceScope } | undefined;
  CreateVehicle: { sector?: LogisticsSector } | undefined;
  VehicleDetails: { listingId: string; requestId?: string };
  EditVehicle: { listingId: string };
};

export type DriverMarketplaceStackParamList = {
  DriverSearch: { initialQuery?: string; scope?: MarketplaceScope } | undefined;
  CreateDriver: { sector?: LogisticsSector } | undefined;
  DriverDetails: { listingId: string; requestId?: string };
  EditDriver: { listingId: string };
};

export type MyListingsStackParamList = {
  MyListingsHome: { scope?: MarketplaceScope } | undefined;
  EditFreightListing: { listingId: string };
  OwnedFreightDetails: { listingId: string };
};

export type DemandRequestStackParamList = {
  DemandRequestsHome: { sector?: LogisticsSector; scope?: MarketplaceScope } | undefined;
  DemandRequestMatches: { requestId: string; requestTitle?: string };
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
};

export type MoreStackParamList = {
  AdminSections: undefined;
  AdminNotificationOperations: AdminNotificationOperationsParams | undefined;
  PlatformModule: {
    moduleKey: AdminModuleKey;
    title?: string;
    eyebrow?: string;
    description?: string;
    ticketId?: string;
    initialStatus?: string;
    initialSearch?: string;
    initialSection?: "requests";
  };
};
