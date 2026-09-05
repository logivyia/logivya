export type CompanySeatUsage = {
  limit: number;
  activeMembers: number;
  suspendedMembers: number;
  legacyInvitedMembers: number;
  pendingInvitations: number;
  used: number;
  available: number;
};

export function calculateCompanySeatUsage(
  input: Omit<CompanySeatUsage, "used" | "available" | "suspendedMembers"> & { suspendedMembers?: number },
): CompanySeatUsage {
  const limit = Math.max(0, Math.trunc(input.limit));
  const activeMembers = Math.max(0, Math.trunc(input.activeMembers));
  const suspendedMembers = Math.max(0, Math.trunc(input.suspendedMembers ?? 0));
  const legacyInvitedMembers = Math.max(0, Math.trunc(input.legacyInvitedMembers));
  const pendingInvitations = Math.max(0, Math.trunc(input.pendingInvitations));
  const used = activeMembers + suspendedMembers + legacyInvitedMembers + pendingInvitations;
  return {
    limit,
    activeMembers,
    suspendedMembers,
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
  const consumesAdditionalSeat = !["ACTIVE", "INVITED", "SUSPENDED"].includes(existingStatus ?? "");
  return !consumesAdditionalSeat || usage.activeMembers + usage.suspendedMembers + usage.legacyInvitedMembers < usage.limit;
}
