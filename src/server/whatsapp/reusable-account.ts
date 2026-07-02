import { AccountStatus } from "@prisma/client";
import { prisma } from "@/server/db";

const REUSABLE_STATUSES: AccountStatus[] = [
  "NEW",
  "PENDING_QR",
  "PENDING_PAIRING",
  "QR_READY",
  "PAIRING_CODE_READY",
  "CONNECTING",
  "DISCONNECTED",
  "RECONNECT_REQUIRED",
  "FAILED",
  "ERROR",
];

export function findReusableWhatsAppAccount(companyId: string, userId: string) {
  return prisma.whatsAppAccount.findFirst({
    where: { companyId, userId, archivedAt: null, status: { in: REUSABLE_STATUSES } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function findSingleSlotWhatsAppAccount(companyId: string, userId: string, accountLimit?: number) {
  if (accountLimit !== 1) return null;
  return prisma.whatsAppAccount.findFirst({
    where: { companyId, userId, archivedAt: null, status: { in: REUSABLE_STATUSES } },
    orderBy: { updatedAt: "desc" },
  });
}
