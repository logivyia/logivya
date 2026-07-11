export type CompanySeatUsage = {
  limit: number;
  activeMembers: number;
  legacyInvitedMembers: number;
  pendingInvitations: number;
  used: number;
  available: number;
};

export function calculateCompanySeatUsage(input: Omit<CompanySeatUsage, "used" | "available">): CompanySeatUsage {
  const limit = Math.max(0, Math.trunc(input.limit));
  const activeMembers = Math.max(0, Math.trunc(input.activeMembers));
  const legacyInvitedMembers = Math.max(0, Math.trunc(input.legacyInvitedMembers));
  const pendingInvitations = Math.max(0, Math.trunc(input.pendingInvitations));
  const used = activeMembers + legacyInvitedMembers + pendingInvitations;
  return {
    limit,
    activeMembers,
    legacyInvitedMembers,
    pendingInvitations,
    used,
    available: Math.max(0, limit - used),
  };
}

export function canReserveInvitationSeat(usage: CompanySeatUsage, existingPendingInvitation: boolean) {
  return existingPendingInvitation || usage.used < usage.limit;
}

export function canActivateMembershipSeat(usage: CompanySeatUsage, existingStatus?: string | null) {
  const consumesAdditionalSeat = existingStatus !== "ACTIVE" && existingStatus !== "INVITED";
  return !consumesAdditionalSeat || usage.activeMembers + usage.legacyInvitedMembers < usage.limit;
}
