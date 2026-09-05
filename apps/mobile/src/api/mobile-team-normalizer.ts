import type {
  MobileTeamUser,
  MobileTeamUsersResponse,
  TeamUserRole,
  TeamUserStatus,
} from "./mobileTeam";

export class MobileTeamDataContractError extends Error {
  readonly code = "MOBILE_TEAM_RESPONSE_INVALID";

  constructor(readonly field: string) {
    super("MOBILE_TEAM_RESPONSE_INVALID");
    this.name = "MobileTeamDataContractError";
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MobileTeamDataContractError(field);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new MobileTeamDataContractError(field);
  }
  return value;
}

function nullableText(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  return text(value, field);
}

function flag(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new MobileTeamDataContractError(field);
  return value;
}

function count(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new MobileTeamDataContractError(field);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new MobileTeamDataContractError(field);
  }
  return value as T;
}

const roles = ["OWNER", "ADMIN", "OPERATOR", "VIEWER"] as const satisfies readonly TeamUserRole[];
const statuses = ["ACTIVE", "INVITED", "SUSPENDED", "REMOVED"] as const satisfies readonly TeamUserStatus[];
const lifecycleStates = [
  "PENDING_ACTIVATION",
  "ACTIVE_SHARED_MEMBER",
  "SHARED_SUBSCRIPTION_EXPIRED",
  "INDEPENDENT_OWNER",
  "DETACHED",
  "SUSPENDED_FOR_SECURITY",
  "REMOVED_BEFORE_ACTIVATION",
] as const;

function normalizeTeamUser(value: unknown, index: number): MobileTeamUser {
  const prefix = `users.${index}`;
  const source = record(value, prefix);
  const user = record(source.user, `${prefix}.user`);
  const sessions = Array.isArray(user.sessions)
    ? user.sessions.map((session, sessionIndex) => {
        const entry = record(session, `${prefix}.user.sessions.${sessionIndex}`);
        return { lastActiveAt: text(entry.lastActiveAt, `${prefix}.user.sessions.${sessionIndex}.lastActiveAt`) };
      })
    : [];
  return {
    id: text(source.id, `${prefix}.id`),
    role: enumValue(source.role, roles, `${prefix}.role`),
    status: enumValue(source.status, statuses, `${prefix}.status`),
    lifecycleState: enumValue(source.lifecycleState, lifecycleStates, `${prefix}.lifecycleState`),
    canManagePendingCredentials: flag(source.canManagePendingCredentials, `${prefix}.canManagePendingCredentials`),
    isCurrent: flag(source.isCurrent, `${prefix}.isCurrent`),
    createdAt: text(source.createdAt, `${prefix}.createdAt`),
    user: {
      id: text(user.id, `${prefix}.user.id`),
      name: text(user.name, `${prefix}.user.name`),
      firstName: nullableText(user.firstName, `${prefix}.user.firstName`),
      lastName: nullableText(user.lastName, `${prefix}.user.lastName`),
      email: text(user.email, `${prefix}.user.email`),
      status: text(user.status, `${prefix}.user.status`),
      mustChangePassword: flag(user.mustChangePassword, `${prefix}.user.mustChangePassword`),
      lastLoginAt: nullableText(user.lastLoginAt, `${prefix}.user.lastLoginAt`),
      sessions,
    },
  };
}

export function normalizeMobileTeamUsersResponse(payload: unknown): MobileTeamUsersResponse {
  const source = record(payload, "response");
  if (!Array.isArray(source.users)) throw new MobileTeamDataContractError("users");
  const seatUsage = record(source.seatUsage, "seatUsage");
  const permissions = record(source.requesterPermissions, "requesterPermissions");
  return {
    users: source.users.map(normalizeTeamUser),
    seatUsage: {
      limit: count(seatUsage.limit, "seatUsage.limit"),
      activeMembers: count(seatUsage.activeMembers, "seatUsage.activeMembers"),
      suspendedMembers: count(seatUsage.suspendedMembers, "seatUsage.suspendedMembers"),
      legacyInvitedMembers: count(seatUsage.legacyInvitedMembers, "seatUsage.legacyInvitedMembers"),
      pendingInvitations: count(seatUsage.pendingInvitations, "seatUsage.pendingInvitations"),
      used: count(seatUsage.used, "seatUsage.used"),
      available: count(seatUsage.available, "seatUsage.available"),
      planSlug: typeof seatUsage.planSlug === "string" ? seatUsage.planSlug : "",
      planName: text(seatUsage.planName, "seatUsage.planName"),
    },
    requesterPermissions: {
      canCreateUsers: flag(permissions.canCreateUsers, "requesterPermissions.canCreateUsers"),
      canSuspendUsers: flag(permissions.canSuspendUsers, "requesterPermissions.canSuspendUsers"),
      canRemoveUsers: flag(permissions.canRemoveUsers, "requesterPermissions.canRemoveUsers"),
      canResetTemporaryPasswords: flag(
        permissions.canResetTemporaryPasswords,
        "requesterPermissions.canResetTemporaryPasswords",
      ),
    },
  };
}
