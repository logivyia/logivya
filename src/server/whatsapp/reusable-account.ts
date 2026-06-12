import { AccountStatus } from "@prisma/client";
import { prisma } from "@/server/db";

const REUSABLE_STATUSES: AccountStatus[] = [
  "NEW",
  "PENDING_QR",
  "QR_READY",
  "CONNECTING",
  "DISCONNECTED",
  "RECONNECT_REQUIRED",
  "ERROR",
];

export function findReusableWhatsAppAccount(companyId: string) {
  return prisma.whatsAppAccount.findFirst({
    where: { companyId, archivedAt: null, status: { in: REUSABLE_STATUSES } },
    orderBy: { updatedAt: "desc" },
  });
}
