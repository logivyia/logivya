import { prisma } from "@/server/db";

export async function cleanupStuckWhatsAppAccounts(companyId?: string) {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  return prisma.whatsAppAccount.updateMany({
    where: {
      ...(companyId ? { companyId } : {}),
      archivedAt: null,
      status: { in: ["PENDING_QR", "PENDING_PAIRING", "QR_READY", "PAIRING_CODE_READY", "CONNECTING"] },
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "FAILED",
      lastError: "Bağlantı denemesinin süresi doldu. Lütfen tekrar deneyin.",
      qrCode: null,
      qrExpiresAt: null,
      pairingCode: null,
      pairingCodeExpiresAt: null,
    },
  });
}
