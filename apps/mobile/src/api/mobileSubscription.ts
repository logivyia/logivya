import { apiClient } from "@/api/client";

export type MobileSubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELED"
  | "CANCELLED"
  | "PAST_DUE"
  | string;

export type MobileSubscription = {
  planName: string | null;
  planSlug: string | null;
  status: MobileSubscriptionStatus;
  billingPeriod: string | null;
  startsAt: string | null;
  endsAt: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  trialDurationDays: number;
  remainingDays: number;
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  limits: {
    maxWhatsappAccounts: number;
    maxTeamUsers: number;
    maxGroups: number;
    maxMessagesPerDay: number;
    maxMessagesPerMonth: number;
    hasScheduledMessages?: boolean;
    hasRecurringMessages?: boolean;
    advancedReportingEnabled?: boolean;
    hasNoBranding?: boolean;
    hasCrm?: boolean;
    hasApi?: boolean;
    groupMessagingEnabled?: boolean;
    contactMessagingEnabled?: boolean;
    deleteForEveryoneEnabled?: boolean;
  } | null;
  entitlements: {
    accountAccess: boolean;
    support: boolean;
    whatsappConnect: boolean;
    groupSync: boolean;
    categoryManagement: boolean;
    groupMessaging: boolean;
    contactMessaging: boolean;
    messageSend: boolean;
    scheduledMessages: boolean;
    recurringMessages: boolean;
    messageHistory: boolean;
    deleteForEveryone: boolean;
    deleteForMe: boolean;
    platformDelete: boolean;
    adFreeMessaging: boolean;
    teamSeats: number;
    whatsappConnections: number;
  };
  lockedFeatures: string[];
  upgradeRequired: boolean;
};

export type MobileCompanyEntitlementSummary = {
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string;
  isActive: boolean;
  seatLimit: number;
  seatsUsed: number;
  pendingInviteSeats: number;
  availableSeats: number;
  whatsappConnectionLimit: number;
  whatsappConnectionsUsed: number;
  whatsappConnectionsAvailable: number;
  canManageBilling: boolean;
  canManageTeam: boolean;
  canInviteMembers: boolean;
  canConnectWhatsApp: boolean;
  trialEligibilityStatus: string | null;
  trialDecisionCode: string | null;
  emailVerificationRequired: boolean;
};

export function getMobileSubscription() {
  return apiClient.request<{ subscription: MobileSubscription; entitlements: MobileCompanyEntitlementSummary }>("/api/mobile/subscription/status");
}

export function resendMobileEmailVerification() {
  return apiClient.post<{ sent?: boolean; alreadyVerified?: boolean }>("/api/mobile/auth/email-verification/resend", {});
}

export function requestMobileSubscriptionUpgrade(input: { planSlug: "starter" | "professional"; billingPeriod: "MONTHLY" | "YEARLY" }) {
  return apiClient.post<{ requested: true; message: string }>("/api/mobile/subscription/request-upgrade", input);
}
