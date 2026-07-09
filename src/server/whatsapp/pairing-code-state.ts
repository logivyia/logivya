import { AccountStatus, type WhatsAppAccount } from "@prisma/client";

type PhonePairingCodeAccount = Pick<WhatsAppAccount, "status" | "phoneNumber" | "lastError"> & {
  pairingCode?: string | null;
  pairingCodeExpiresAt?: Date | null;
};

export function canExposePhonePairingCode(account: PhonePairingCodeAccount, phoneNumber?: string, minTtlMs = 0) {
  if (account.status !== AccountStatus.PAIRING_CODE_READY) return false;
  if (account.lastError) return false;
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
