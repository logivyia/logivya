import { prisma } from "@/server/db";

export async function cleanupStuckWhatsAppAccounts(companyId?: string) {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  return prisma.whatsAppAccount.updateMany({
    where: {
      ...(companyId ? { companyId } : {}),
      archivedAt: null,
      status: { in: ["PENDING_QR", "QR_READY", "CONNECTING"] },
      updatedAt: { lt: cutoff },
    },
    data: {
      status: "ERROR",
      lastError: "QR generation expired. Please generate a new QR code.",
      qrCode: null,
      qrExpiresAt: null,
      pairingCode: null,
      pairingCodeExpiresAt: null,
    },
  });
}
