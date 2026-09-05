import { corePlanRule } from "@/server/billing/plan-matrix";

export type AdminSeatIntegrityStatus =
  | "OK"
  | "CONFIGURATION_REQUIRED"
  | "RECONCILIATION_REQUIRED"
  | "RETIRED";

export type AdminSeatCapacitySource =
  | "ACTIVE_PLAN"
  | "ACTIVE_UNKNOWN_PLAN"
  | "TRIAL_ENTITLEMENT"
  | "OWNER_BASELINE"
  | "RETIRED";

export type AdminSeatIntegrityInput = {
  companyName: string;
  ownerEmail: string;
  hasOwnerMembership: boolean;
  hasActiveSubscription: boolean;
  hasAnySubscription: boolean;
  activePlanSlug?: string | null;
  activePlanMaxTeamUsers?: number | null;
  trialEntitlementStatus?: string | null;
  activeMembers: number;
  suspendedMembers: number;
  invitedMembers: number;
  pendingInvitations: number;
};

export function isNonActionableSyntheticTenant(input: Pick<AdminSeatIntegrityInput, "companyName" | "ownerEmail">) {
  const name = input.companyName.trim().toLowerCase();
  const email = input.ownerEmail.trim().toLowerCase();
  const syntheticMarker = ["retired", "smoke", "proof", "test"].some((marker) => name.includes(marker));
  const syntheticIdentity = email.endsWith(".invalid")
    || email.includes("@invalid.")
    || email.endsWith(".example")
    || email.includes("retired-auth-smoke");
  return syntheticMarker && syntheticIdentity;
}

export function isRetiredSmokeTestTenant(input: Pick<AdminSeatIntegrityInput, "companyName" | "ownerEmail">) {
  return isNonActionableSyntheticTenant(input);
}

export function resolveAdminSeatIntegrity(input: AdminSeatIntegrityInput) {
  const used = input.activeMembers
    + input.suspendedMembers
    + input.invitedMembers
    + input.pendingInvitations;
  const retired = isNonActionableSyntheticTenant(input);

  if (retired) {
    return {
      limit: 0,
      used: 0,
      available: 0,
      capacitySource: "RETIRED" as const,
      integrityStatus: "RETIRED" as const,
      configurationRequired: false,
      reconciliationRequired: false,
      ownerRelationshipValid: input.hasOwnerMembership,
    };
  }

  const canonicalRule = input.hasActiveSubscription
    ? corePlanRule(input.activePlanSlug)
    : null;
  const hasExplicitTrialState = Boolean(input.trialEntitlementStatus);
  const limit = input.hasActiveSubscription
    ? Math.max(1, canonicalRule?.totalUserSeats ?? input.activePlanMaxTeamUsers ?? 1)
    : 1;
  const capacitySource: AdminSeatCapacitySource = input.hasActiveSubscription
    ? canonicalRule
      ? "ACTIVE_PLAN"
      : "ACTIVE_UNKNOWN_PLAN"
    : hasExplicitTrialState
      ? "TRIAL_ENTITLEMENT"
      : "OWNER_BASELINE";
  const configurationRequired = !input.hasOwnerMembership
    || (input.hasActiveSubscription && !canonicalRule)
    || (!input.hasActiveSubscription && !hasExplicitTrialState && !input.hasAnySubscription)
    || (!input.hasActiveSubscription && used > limit);
  const reconciliationRequired = Boolean(
    input.hasActiveSubscription
      && canonicalRule
      && used > limit,
  );
  const integrityStatus: AdminSeatIntegrityStatus = reconciliationRequired
    ? "RECONCILIATION_REQUIRED"
    : configurationRequired
      ? "CONFIGURATION_REQUIRED"
      : "OK";

  return {
    limit,
    used,
    available: Math.max(0, limit - used),
    capacitySource,
    integrityStatus,
    configurationRequired,
    reconciliationRequired,
    ownerRelationshipValid: input.hasOwnerMembership,
  };
}
