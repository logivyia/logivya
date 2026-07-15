import { apiClient } from "@/api/client";

export type TeamUserRole = "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
export type TeamUserStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";

export type MobileTeamUser = {
  id: string;
  role: TeamUserRole;
  status: TeamUserStatus;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    status: string;
    sessions: Array<{ lastActiveAt: string }>;
  };
};

export type InviteTeamUserInput = {
  name: string;
  email: string;
};

export type MobileCompanyInvitation = {
  id: string;
  email: string;
  name: string;
  role: Exclude<TeamUserRole, "OWNER">;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type TeamSeatUsage = {
  limit: number;
  activeMembers: number;
  legacyInvitedMembers: number;
  pendingInvitations: number;
  used: number;
  available: number;
  planSlug: string;
  planName: string;
  whatsappConnectionLimit: number;
  whatsappConnectionsUsed: number;
  whatsappConnectionsAvailable: number;
};

export type UpdateTeamUserInput = Partial<{
  role: TeamUserRole;
  status: TeamUserStatus;
}>;

export function getMobileTeamUsers() {
  return apiClient.request<{ users: MobileTeamUser[]; invitations: MobileCompanyInvitation[]; seatUsage: TeamSeatUsage }>("/api/mobile/team/users");
}

export function inviteMobileTeamUser(input: InviteTeamUserInput) {
  return apiClient.request<{ invitation: MobileCompanyInvitation; emailSent: boolean }>("/api/mobile/team/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resendMobileTeamInvitation(id: string) {
  return apiClient.post<{ invitation: MobileCompanyInvitation; emailSent: boolean }>(`/api/mobile/team/invitations/${id}/resend`, {});
}

export function revokeMobileTeamInvitation(id: string) {
  return apiClient.delete<{ success: true }>(`/api/mobile/team/invitations/${id}`);
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
