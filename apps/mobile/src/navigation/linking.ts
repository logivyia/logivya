export const linking = {
  prefixes: ["logivya://", "https://www.logivya.com"],
  config: {
    screens: {
      Login: "login",
      Register: "register",
      ForgotPassword: "forgot-password",
      ResetPassword: "reset-password/:identifier?",
      Dashboard: "dashboard",
      WhatsApp: {
        path: "whatsapp",
        screens: {
          WhatsAppAccounts: "accounts",
          WhatsAppQR: "accounts/qr",
          WhatsAppPhoneConnect: "accounts/phone-code"
        }
      },
      Messaging: "messages",
      Support: {
        path: "support",
        screens: {
          SupportTickets: "",
          CreateTicket: "new",
          TicketDetail: "tickets/:ticketId"
        }
      },
      Profile: {
        path: "profile",
        screens: {
          ProfileHome: "",
          Notifications: "notifications",
          Subscription: "subscription",
          Settings: "settings"
        }
      }
    }
  }
};
