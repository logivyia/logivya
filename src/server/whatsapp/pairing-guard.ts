import { AccountStatus } from "@prisma/client";
import { prisma } from "@/server/db";

const PHONE_PAIRING_GUARD_MS = Number(process.env.WHATSAPP_PHONE_PAIRING_GUARD_MS || 5 * 60_000);

type PairingGuardAccount = {
  status: AccountStatus | string;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: Date | null;
  lastError?: string | null;
  updatedAt: Date;
};

const ACTIVE_PHONE_PAIRING_STATUSES = new Set<string>([
  AccountStatus.PENDING_PAIRING,
  AccountStatus.PAIRING_CODE_READY,
  AccountStatus.CONNECTING,
]);

const NON_FATAL_PHONE_PAIRING_ERRORS = new Set<string>([
  "WHATSAPP_TRANSIENT_DISCONNECT",
  "WHATSAPP_PAIRING_RETRY_SCHEDULED",
]);

function hasFreshPairingCode(account: PairingGuardAccount) {
  return Boolean(account.pairingCode && account.pairingCodeExpiresAt && account.pairingCodeExpiresAt.getTime() > Date.now());
}

function hasBlockingPairingError(lastError?: string | null) {
  return Boolean(lastError && !NON_FATAL_PHONE_PAIRING_ERRORS.has(lastError));
}

export function hasActivePhonePairing(account: PairingGuardAccount) {
  if (!ACTIVE_PHONE_PAIRING_STATUSES.has(account.status)) return false;
  if (hasFreshPairingCode(account) && !hasBlockingPairingError(account.lastError)) return true;
  if (account.lastError) return false;
  if (account.status === AccountStatus.PAIRING_CODE_READY) return hasFreshPairingCode(account);
  return account.status === AccountStatus.PENDING_PAIRING && Date.now() - account.updatedAt.getTime() < PHONE_PAIRING_GUARD_MS;
}

export async function isPhonePairingActive(accountId: string) {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: accountId },
    select: { status: true, pairingCode: true, pairingCodeExpiresAt: true, lastError: true, updatedAt: true },
  });
  return account ? hasActivePhonePairing(account) : false;
}
