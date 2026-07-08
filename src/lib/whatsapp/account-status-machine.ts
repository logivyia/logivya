/**
 * CRITICAL LOGIVYA WHATSAPP CONNECTION MODULE.
 * Do not modify without running the full WhatsApp regression test suite.
 */
import { AccountStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const MODERN_ACCOUNT_STATUSES = [
  AccountStatus.CREATED, AccountStatus.PENDING_QR, AccountStatus.PENDING_PAIRING,
  AccountStatus.PAIRING_CODE_READY, AccountStatus.CONNECTING, AccountStatus.CONNECTED,
  AccountStatus.RECONNECT_REQUIRED, AccountStatus.FAILED, AccountStatus.DISCONNECTED,
  AccountStatus.ARCHIVED,
] as const;

export const RECOVERABLE_ACCOUNT_STATUSES = [
  AccountStatus.CONNECTED,
  AccountStatus.CONNECTING,
  AccountStatus.DISCONNECTED,
  AccountStatus.RECONNECT_REQUIRED,
] as const;

export function isRecoverableWhatsAppStatus(status: AccountStatus, lastError?: string | null) {
  if (lastError === "WHATSAPP_LOGGED_OUT") return false;
  return (RECOVERABLE_ACCOUNT_STATUSES as readonly AccountStatus[]).includes(status);
}

export function requiresFreshWhatsAppPairing(status: AccountStatus, lastError?: string | null) {
  return lastError === "WHATSAPP_LOGGED_OUT" || ([AccountStatus.FAILED, AccountStatus.ERROR] as readonly AccountStatus[]).includes(status);
}

const transitions: Record<AccountStatus, readonly AccountStatus[]> = {
  CREATED: [AccountStatus.PENDING_QR, AccountStatus.PENDING_PAIRING, AccountStatus.ARCHIVED],
  NEW: [AccountStatus.CREATED, AccountStatus.PENDING_QR, AccountStatus.PENDING_PAIRING, AccountStatus.ARCHIVED],
  PENDING_QR: [AccountStatus.CREATED, AccountStatus.CONNECTING, AccountStatus.FAILED, AccountStatus.RECONNECT_REQUIRED, AccountStatus.ARCHIVED],
  PENDING_PAIRING: [AccountStatus.CREATED, AccountStatus.PAIRING_CODE_READY, AccountStatus.FAILED, AccountStatus.RECONNECT_REQUIRED, AccountStatus.ARCHIVED],
  QR_READY: [AccountStatus.CREATED, AccountStatus.CONNECTING, AccountStatus.FAILED, AccountStatus.ARCHIVED],
  PAIRING_CODE_READY: [AccountStatus.CREATED, AccountStatus.CONNECTING, AccountStatus.FAILED, AccountStatus.RECONNECT_REQUIRED, AccountStatus.ARCHIVED],
  CONNECTING: [AccountStatus.CREATED, AccountStatus.CONNECTED, AccountStatus.FAILED, AccountStatus.RECONNECT_REQUIRED, AccountStatus.ARCHIVED],
  CONNECTED: [AccountStatus.CONNECTING, AccountStatus.DISCONNECTED, AccountStatus.RECONNECT_REQUIRED, AccountStatus.FAILED, AccountStatus.ARCHIVED],
  RECONNECT_REQUIRED: [AccountStatus.CREATED, AccountStatus.CONNECTING, AccountStatus.CONNECTED, AccountStatus.DISCONNECTED, AccountStatus.FAILED, AccountStatus.ARCHIVED],
  FAILED: [AccountStatus.CREATED, AccountStatus.CONNECTING, AccountStatus.CONNECTED, AccountStatus.ARCHIVED],
  DISCONNECTED: [AccountStatus.CREATED, AccountStatus.CONNECTING, AccountStatus.CONNECTED, AccountStatus.RECONNECT_REQUIRED, AccountStatus.FAILED, AccountStatus.ARCHIVED],
  ARCHIVED: [AccountStatus.DISCONNECTED],
  ERROR: [AccountStatus.CREATED, AccountStatus.CONNECTING, AccountStatus.CONNECTED, AccountStatus.FAILED, AccountStatus.ARCHIVED],
};

export function assertValidTransition(from: AccountStatus, to: AccountStatus) {
  if (from === to || transitions[from]?.includes(to)) return;
  throw new Error(`INVALID_WHATSAPP_STATUS_TRANSITION:${from}:${to}`);
}

export async function transitionAccountStatus(accountId: string, to: AccountStatus, data: Omit<Prisma.WhatsAppAccountUpdateInput, "status"> = {}) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId }, select: { status: true } });
    assertValidTransition(account.status, to);
    return tx.whatsAppAccount.update({ where: { id: accountId }, data: { ...data, status: to } });
  });
}

export async function resetAccountForConnection(accountId: string, target: typeof AccountStatus.PENDING_QR | typeof AccountStatus.PENDING_PAIRING, data: Omit<Prisma.WhatsAppAccountUpdateInput, "status"> = {}) {
  const account = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId }, select: { status: true, archivedAt: true } });
  if (account.archivedAt || account.status === AccountStatus.ARCHIVED || account.status === AccountStatus.CONNECTED) throw new Error("WHATSAPP_ACCOUNT_NOT_RECONNECTABLE");
  if (account.status !== AccountStatus.CREATED) await transitionAccountStatus(accountId, AccountStatus.CREATED);
  return transitionAccountStatus(accountId, target, {
    qrCode: null,
    qrExpiresAt: null,
    pairingCode: null,
    pairingCodeExpiresAt: null,
    lastError: null,
    reconnectRetryCount: 0,
    recoveryLevel: 0,
    healthScore: target === AccountStatus.PENDING_PAIRING ? 35 : 25,
    ...data,
  });
}

export async function cleanupStaleAccountStates(companyId?: string) {
  return prisma.whatsAppAccount.updateMany({
    where: {
      ...(companyId ? { companyId } : {}), archivedAt: null,
      status: { in: [AccountStatus.PENDING_QR, AccountStatus.PENDING_PAIRING, AccountStatus.QR_READY, AccountStatus.PAIRING_CODE_READY] },
      updatedAt: { lt: new Date(Date.now() - 10 * 60_000) },
    },
    data: {
      status: AccountStatus.FAILED, lastError: "Baglanti denemesinin suresi doldu. Lutfen tekrar deneyin.",
      qrCode: null, qrExpiresAt: null, pairingCode: null, pairingCodeExpiresAt: null,
    },
  });
}
