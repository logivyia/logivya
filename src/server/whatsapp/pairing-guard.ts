import { AccountStatus } from "@prisma/client";
import { prisma } from "@/server/db";

const PHONE_PAIRING_GUARD_MS = Number(process.env.WHATSAPP_PHONE_PAIRING_GUARD_MS || 5 * 60_000);

type PairingGuardAccount = {
  status: AccountStatus | string;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: Date | null;
  updatedAt: Date;
};

const ACTIVE_PHONE_PAIRING_STATUSES = new Set<string>([
  AccountStatus.PENDING_PAIRING,
  AccountStatus.PAIRING_CODE_READY,
]);

export function hasActivePhonePairing(account: PairingGuardAccount) {
  if (!ACTIVE_PHONE_PAIRING_STATUSES.has(account.status)) return false;
  if (account.pairingCode && account.pairingCodeExpiresAt && account.pairingCodeExpiresAt.getTime() > Date.now()) return true;
  return account.status === AccountStatus.PENDING_PAIRING && Date.now() - account.updatedAt.getTime() < PHONE_PAIRING_GUARD_MS;
}

export async function isPhonePairingActive(accountId: string) {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: accountId },
    select: { status: true, pairingCode: true, pairingCodeExpiresAt: true, updatedAt: true },
  });
  return account ? hasActivePhonePairing(account) : false;
}
