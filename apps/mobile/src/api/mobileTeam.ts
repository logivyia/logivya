import { apiClient } from "@/api/client";
import { normalizeMobileTeamUsersResponse } from "@/api/mobile-team-normalizer";

export {
  MobileTeamDataContractError,
  normalizeMobileTeamUsersResponse,
} from "@/api/mobile-team-normalizer";

export type TeamUserRole = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
export type TeamUserStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";

export type MobileTeamUser = {
  id: string;
  role: TeamUserRole;
  status: TeamUserStatus;
  lifecycleState: "PENDING_ACTIVATION" | "ACTIVE_SHARED_MEMBER" | "SHARED_SUBSCRIPTION_EXPIRED" | "INDEPENDENT_OWNER" | "DETACHED" | "SUSPENDED_FOR_SECURITY" | "REMOVED_BEFORE_ACTIVATION";
  canManagePendingCredentials: boolean;
  isCurrent: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    status: string;
    mustChangePassword: boolean;
    lastLoginAt?: string | null;
    sessions: Array<{ lastActiveAt: string }>;
  };
};

export type CreateTeamUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
};

export type TeamSeatUsage = {
  limit: number;
  activeMembers: number;
  suspendedMembers: number;
  legacyInvitedMembers: number;
  pendingInvitations: number;
  used: number;
  available: number;
  planSlug: string;
  planName: string;
};

export type UpdateTeamUserInput = Partial<{
  status: TeamUserStatus;
}>;

export type MobileTeamUsersResponse = {
  users: MobileTeamUser[];
  seatUsage: TeamSeatUsage;
  requesterPermissions: {
    canCreateUsers: boolean;
    canSuspendUsers: boolean;
    canRemoveUsers: boolean;
    canResetTemporaryPasswords: boolean;
  };
};

export async function getMobileTeamUsers() {
  const payload = await apiClient.request<unknown>("/api/mobile/team/users");
  return normalizeMobileTeamUsersResponse(payload);
}

export function createMobileTeamUser(input: CreateTeamUserInput) {
  return apiClient.post<{
    user: { id: string; name: string; email: string; mustChangePassword: boolean };
    capacity: { used: number; limit: number; remaining: number };
  }>("/api/mobile/team/users", input);
}

export function resetMobileTeamUserTemporaryPassword(id: string, temporaryPassword: string) {
  return apiClient.post<{ success: true }>(`/api/mobile/team/users/${id}/temporary-password`, { temporaryPassword });
}

export function updateMobileTeamUser(id: string, input: UpdateTeamUserInput) {
  return apiClient.request<{ success: true }>(`/api/mobile/team/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteMobileTeamUser(id: string) {
  return apiClient.delete<{ success: true }>(`/api/mobile/team/users/${id}`);
}
