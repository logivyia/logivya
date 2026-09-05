import type { MobileWhatsAppAccount } from "./mobileWhatsApp";

export class MobileWhatsAppDataContractError extends Error {
  constructor(public readonly field: string) {
    super(`MOBILE_WHATSAPP_DATA_CONTRACT:${field}`);
    this.name = "MobileWhatsAppDataContractError";
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MobileWhatsAppDataContractError(field);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new MobileWhatsAppDataContractError(field);
  }
  return value;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeMobileWhatsAppAccount(value: unknown): MobileWhatsAppAccount {
  const account = record(value, "account");
  const normalizedHealthLabel = nullableString(account.healthLabel);

  return {
    id: requiredString(account.id, "account.id"),
    label: nullableString(account.label),
    phoneNumber: nullableString(account.phoneNumber),
    countryIso: nullableString(account.countryIso),
    messageLocale: nullableString(account.messageLocale),
    displayName: nullableString(account.displayName),
    status: requiredString(account.status, "account.status"),
    qrCode: nullableString(account.qrCode),
    qrExpiresAt: nullableString(account.qrExpiresAt),
    pairingCode: nullableString(account.pairingCode),
    pairingCodeExpiresAt: nullableString(account.pairingCodeExpiresAt),
    groupCount: finiteNumber(account.groupCount),
    contactCount: finiteNumber(account.contactCount),
    healthScore: finiteNumber(account.healthScore),
    ...(normalizedHealthLabel ? { healthLabel: normalizedHealthLabel } : {}),
    recoveryLevel: finiteNumber(account.recoveryLevel),
    lastConnectedAt: nullableString(account.lastConnectedAt),
    lastDisconnectedAt: nullableString(account.lastDisconnectedAt),
    lastSyncedAt: nullableString(account.lastSyncedAt),
    lastHeartbeatAt: nullableString(account.lastHeartbeatAt),
    lastPingAt: nullableString(account.lastPingAt),
    lastPongAt: nullableString(account.lastPongAt),
    lastMessageAt: nullableString(account.lastMessageAt),
    lastGroupSyncAt: nullableString(account.lastGroupSyncAt),
    sessionRestoredAt: nullableString(account.sessionRestoredAt),
    sessionSnapshotAt: nullableString(account.sessionSnapshotAt),
    archivedAt: nullableString(account.archivedAt),
    lastError: nullableString(account.lastError)
  };
}

export function normalizeMobileWhatsAppAccountResponse(value: unknown) {
  const response = record(value, "response");
  return { account: normalizeMobileWhatsAppAccount(response.account) };
}
