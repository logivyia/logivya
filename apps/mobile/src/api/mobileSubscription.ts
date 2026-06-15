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
  status: MobileSubscriptionStatus;
  billingPeriod: string | null;
  startsAt: string | null;
  endsAt: string | null;
  remainingDays: number;
  isTrial: boolean;
  isExpired: boolean;
  limits: {
    maxWhatsappAccounts: number;
    maxTeamUsers: number;
    maxGroups: number;
    maxMessagesPerDay: number;
    maxMessagesPerMonth: number;
  } | null;
  lockedFeatures: string[];
  upgradeRequired: boolean;
};

export function getMobileSubscription() {
  return apiClient.request<{ subscription: MobileSubscription }>("/api/mobile/subscription/status");
}
