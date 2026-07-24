export type MessageTargetCounts = {
  groupCount: number;
  contactCount: number;
};

export type MessageTargetEntitlements = {
  active: boolean;
  groupMessaging: boolean;
  contactMessaging: boolean;
};

export type MessageTargetAccess = {
  allowed: boolean;
  reason?: "subscription.inactive" | "entitlement.groupMessaging" | "entitlement.contactMessaging";
  limit: undefined;
  used: number;
};

export function evaluateMessageTargetAccess(
  entitlements: MessageTargetEntitlements,
  targets: MessageTargetCounts,
): MessageTargetAccess {
  const used = targets.groupCount + targets.contactCount;
  if (!entitlements.active) {
    return { allowed: false, reason: "subscription.inactive", limit: undefined, used };
  }
  if (targets.groupCount > 0 && !entitlements.groupMessaging) {
    return { allowed: false, reason: "entitlement.groupMessaging", limit: undefined, used };
  }
  if (targets.contactCount > 0 && !entitlements.contactMessaging) {
    return { allowed: false, reason: "entitlement.contactMessaging", limit: undefined, used };
  }
  return { allowed: true, reason: undefined, limit: undefined, used };
}
