import { getStateFromPath } from "@react-navigation/native";

import {
  adminNotificationOperationsLinking,
  normalizeAdminNotificationPath,
} from "@/navigation/admin-notification-links";
import { parseMarketplaceLinkIdentifier } from "@/navigation/marketplace-link-context";

export {
  normalizeAdminNotificationPath,
  parseNotificationAdminTab,
} from "@/navigation/admin-notification-links";

export const linking = {
  prefixes: ["logivya://", "https://www.logivya.com"],
  getStateFromPath: (path: string, options: Parameters<typeof getStateFromPath>[1]) =>
    getStateFromPath(normalizeAdminNotificationPath(path), options),
  config: {
    screens: {
      Login: "login",
      Register: "register",
      ForgotPassword: "forgot-password",
      ResetPassword: "reset-password/:identifier?",
      Dashboard: "dashboard",
      HomeMoving: "marketplace/home-moving",
      PartialLoad: "marketplace/partial-load",
      HeavyHaul: "marketplace/heavy-haul",
      CreateLoad: {
        path: "marketplace/loads/share",
        screens: {
          CreateLoadHome: ""
        }
      },
      FindLoads: {
        path: "marketplace/loads",
        screens: {
          FindLoadsHome: "",
          FreightDetails: {
            path: ":listingId",
            parse: {
              listingId: parseMarketplaceLinkIdentifier,
              requestId: parseMarketplaceLinkIdentifier
            }
          }
        }
      },
      VehicleMarketplace: {
        path: "marketplace/vehicles",
        screens: {
          VehicleSearch: "",
          CreateVehicle: "share",
          VehicleDetails: {
            path: ":listingId",
            parse: {
              listingId: parseMarketplaceLinkIdentifier,
              requestId: parseMarketplaceLinkIdentifier
            }
          }
        }
      },
      DriverMarketplace: {
        path: "marketplace/drivers",
        screens: {
          DriverSearch: "",
          DriverDetails: {
            path: ":listingId",
            parse: {
              listingId: parseMarketplaceLinkIdentifier,
              requestId: parseMarketplaceLinkIdentifier
            }
          }
        }
      },
      DemandRequests: {
        path: "marketplace/requests",
        screens: {
          DemandRequestsHome: "",
          DemandRequestMatches: ":requestId/matches"
        }
      },
      MyListings: {
        path: "marketplace/my-listings",
        screens: {
          MyListingsHome: ""
        }
      },
      WhatsApp: {
        path: "whatsapp",
        screens: {
          WhatsAppAccounts: "accounts",
          WhatsAppQR: "accounts/qr",
          WhatsAppPhoneConnect: "accounts/phone-code"
        }
      },
      FacebookPages: "facebook",
      Messaging: "messages",
      Support: {
        path: "support",
        screens: {
          SupportTickets: "",
          CreateTicket: "new",
          TicketDetail: "tickets/:ticketId"
        }
      },
      More: {
        path: "more",
        initialRouteName: "AdminSections",
        screens: {
          AdminSections: "",
          AdminNotificationOperations: {
            ...adminNotificationOperationsLinking,
            path: "profile/admin/notifications/:initialTab?",
            exact: true
          },
          PlatformModule: {
            path: "profile/admin/:moduleKey/:ticketId?",
            exact: true,
            alias: [{ path: "admin/:moduleKey/:ticketId?", exact: true }]
          }
        }
      },
      Profile: {
        path: "profile",
        screens: {
          ProfileHome: "",
          Notifications: "notifications",
          NotificationPreferences: "notifications/preferences",
          NotificationPermissionEducation: "notifications/permission",
          Subscription: "subscription",
          Settings: "settings",
          PrivacyData: "privacy"
        }
      }
    }
  }
};
