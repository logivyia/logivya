import { AccountStatus } from "@prisma/client";
import { computeWhatsAppHealthScore, healthLabel } from "@/server/whatsapp/connection-health";
import { visiblePhonePairingCode } from "@/server/whatsapp/pairing-code-state";

export function mobileWhatsAppStatus(status: AccountStatus, lastError?: string | null) {
  if (lastError === "WHATSAPP_LOGGED_OUT") return "AUTH_REQUIRED";
  if (lastError === "WHATSAPP_CREDENTIALS_MISSING" && !["CONNECTED", "CONNECTING", "DISCONNECTED", "RECONNECT_REQUIRED"].includes(status)) return "AUTH_REQUIRED";
  if (lastError === "WHATSAPP_CREDENTIALS_MISSING") return "RECONNECTING";
  if (lastError === "WHATSAPP_TRANSIENT_DISCONNECT" || lastError === "WHATSAPP_RECONNECT_REQUIRED") return "RECONNECTING";
  if (status === "CONNECTED") return "CONNECTED";
  if (status === "CONNECTING") return "RECONNECTING";
  if (status === "DISCONNECTED") return "DEGRADED";
  if (status === "RECONNECT_REQUIRED") return "RECONNECTING";
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
  lastHeartbeatAt?: Date | null;
  lastPingAt?: Date | null;
  lastPongAt?: Date | null;
  lastMessageAt?: Date | null;
  lastGroupSyncAt?: Date | null;
  lastConnectionLatencyMs?: number | null;
  batteryState?: string | null;
  healthScore?: number | null;
  recoveryLevel?: number | null;
  sessionRestoredAt?: Date | null;
  sessionSnapshotAt?: Date | null;
  qrCode?: string | null;
  qrExpiresAt?: Date | null;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: Date | null;
  _count?: { groups: number; contacts: number };
}) {
  const safePairingCode = visiblePhonePairingCode(account);
  const displayStatus = safePairingCode.pairingCode ? "PENDING_PHONE_CODE" : mobileWhatsAppStatus(account.status, account.lastError);
  const healthScore = account.healthScore ?? computeWhatsAppHealthScore({
    status: account.status,
    lastError: account.lastError,
    lastHeartbeatAt: account.lastHeartbeatAt,
    lastPongAt: account.lastPongAt,
    lastSyncedAt: account.lastSyncedAt,
    groupCount: account._count?.groups ?? 0,
    hasSessionSnapshot: Boolean(account.sessionSnapshotAt),
  });
  return {
    id: account.id,
    label: account.label,
    phoneNumber: account.phoneNumber,
    displayName: account.displayName,
    status: displayStatus,
    rawStatus: account.status,
    groupCount: account._count?.groups ?? 0,
    contactCount: account._count?.contacts ?? 0,
    lastConnectedAt: account.lastConnectedAt,
    lastDisconnectedAt: account.lastDisconnectedAt,
    lastSyncedAt: account.lastSyncedAt,
    lastHeartbeatAt: account.lastHeartbeatAt,
    lastPingAt: account.lastPingAt,
    lastPongAt: account.lastPongAt,
    lastMessageAt: account.lastMessageAt,
    lastGroupSyncAt: account.lastGroupSyncAt,
    lastConnectionLatencyMs: account.lastConnectionLatencyMs,
    batteryState: account.batteryState,
    healthScore,
    healthLabel: healthLabel(healthScore),
    recoveryLevel: account.recoveryLevel ?? 0,
    sessionRestoredAt: account.sessionRestoredAt,
    sessionSnapshotAt: account.sessionSnapshotAt,
    archivedAt: account.archivedAt,
    lastError: null,
    qrCode: account.qrCode,
    qrExpiresAt: account.qrExpiresAt,
    pairingCode: safePairingCode.pairingCode,
    pairingCodeExpiresAt: safePairingCode.pairingCodeExpiresAt,
  };
}
