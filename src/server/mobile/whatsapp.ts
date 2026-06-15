import { AccountStatus } from "@prisma/client";

export function mobileWhatsAppStatus(status: AccountStatus) {
  if (status === "CONNECTED") return "CONNECTED";
  if (status === "ARCHIVED") return "ARCHIVED";
  if (status === "PENDING_QR" || status === "QR_READY") return "PENDING_QR";
  if (status === "PENDING_PAIRING" || status === "PAIRING_CODE_READY") return "PENDING_PHONE_CODE";
  if (status === "FAILED" || status === "ERROR") return "FAILED";
  return "DISCONNECTED";
}

export function serializeMobileAccount(account: {
  id: string;
  label: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  status: AccountStatus;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  lastSyncedAt: Date | null;
  archivedAt: Date | null;
  lastError: string | null;
  qrCode?: string | null;
  qrExpiresAt?: Date | null;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: Date | null;
  _count?: { groups: number; contacts: number };
}) {
  return {
    id: account.id,
    label: account.label,
    phoneNumber: account.phoneNumber,
    displayName: account.displayName,
    status: mobileWhatsAppStatus(account.status),
    rawStatus: account.status,
    groupCount: account._count?.groups ?? 0,
    contactCount: account._count?.contacts ?? 0,
    lastConnectedAt: account.lastConnectedAt,
    lastDisconnectedAt: account.lastDisconnectedAt,
    lastSyncedAt: account.lastSyncedAt,
    archivedAt: account.archivedAt,
    lastError: account.lastError ? "WHATSAPP_CONNECTION_FAILED" : null,
    qrCode: account.qrCode,
    qrExpiresAt: account.qrExpiresAt,
    pairingCode: account.pairingCode,
    pairingCodeExpiresAt: account.pairingCodeExpiresAt,
  };
}
