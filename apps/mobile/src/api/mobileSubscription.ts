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
  } | null;
  entitlements: {
    accountAccess: boolean;
    support: boolean;
    whatsappConnect: boolean;
    groupSync: boolean;
    categoryManagement: boolean;
    messageSend: boolean;
    scheduledMessages: boolean;
    recurringMessages: boolean;
    messageHistory: boolean;
    deleteForEveryone: boolean;
    deleteForMe: boolean;
    platformDelete: boolean;
  };
  lockedFeatures: string[];
  upgradeRequired: boolean;
};

export function getMobileSubscription() {
  return apiClient.request<{ subscription: MobileSubscription }>("/api/mobile/subscription/status");
}
