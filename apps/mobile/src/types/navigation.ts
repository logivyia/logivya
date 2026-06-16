export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { identifier?: string } | undefined;
};

export type AppTabParamList = {
  Dashboard: undefined;
  WhatsApp: undefined;
  Groups: undefined;
  Categories: undefined;
  Messaging: undefined;
  Support: undefined;
  Profile: undefined;
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
  Feedback: undefined;
  Settings: undefined;
};
