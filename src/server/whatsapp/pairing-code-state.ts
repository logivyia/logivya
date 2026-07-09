import { AccountStatus, type WhatsAppAccount } from "@prisma/client";

type PhonePairingCodeAccount = Pick<WhatsAppAccount, "status" | "phoneNumber" | "lastError"> & {
  pairingCode?: string | null;
  pairingCodeExpiresAt?: Date | null;
};

const DISPLAYABLE_PHONE_PAIRING_STATUSES = new Set<string>([
  AccountStatus.PAIRING_CODE_READY,
  AccountStatus.CONNECTING,
]);

const NON_FATAL_PHONE_PAIRING_ERRORS = new Set<string>([
  "WHATSAPP_TRANSIENT_DISCONNECT",
  "WHATSAPP_PAIRING_RETRY_SCHEDULED",
]);

function blocksPairingCodeDisplay(lastError?: string | null) {
  return Boolean(lastError && !NON_FATAL_PHONE_PAIRING_ERRORS.has(lastError));
}

export function canExposePhonePairingCode(account: PhonePairingCodeAccount, phoneNumber?: string, minTtlMs = 0) {
  if (!DISPLAYABLE_PHONE_PAIRING_STATUSES.has(account.status)) return false;
  if (blocksPairingCodeDisplay(account.lastError)) return false;
  if (phoneNumber !== undefined && account.phoneNumber !== phoneNumber) return false;
  if (!account.pairingCode || !account.pairingCodeExpiresAt) return false;
  return account.pairingCodeExpiresAt.getTime() - Date.now() > minTtlMs;
}

export function visiblePhonePairingCode(account: PhonePairingCodeAccount) {
  if (!canExposePhonePairingCode(account)) {
    return { pairingCode: null, pairingCodeExpiresAt: null };
  }
  return { pairingCode: account.pairingCode, pairingCodeExpiresAt: account.pairingCodeExpiresAt };
}
