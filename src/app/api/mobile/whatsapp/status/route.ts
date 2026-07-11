import { prisma } from "@/server/db";
import { requireMobileAuth } from "@/server/mobile/auth";
import {
  mobileWhatsAppAccountLogContext,
  mobileWhatsAppCorrelationId,
  requestWhatsAppSessionRestoreWithinTimeout,
} from "@/server/mobile/whatsapp-account-listing";
import { mobileSafeError, mobileSuccess } from "@/server/mobile/response";
import { serializeMobileAccount } from "@/server/mobile/whatsapp";
import { logger } from "@/server/observability/logger";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const correlationId = mobileWhatsAppCorrelationId(request);
  try {
    const auth = await requireMobileAuth(request);
    const { company, user } = auth;
    logger.info("WA_ACCOUNTS_REQUEST_START", mobileWhatsAppAccountLogContext(correlationId, auth, startedAt, { route: "status" }));
    let accounts = await prisma.whatsAppAccount.findMany({
      where: { companyId: company.id, userId: user.id, archivedAt: null },
      include: { _count: { select: { groups: true, contacts: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const restoreCount = await requestWhatsAppSessionRestoreWithinTimeout(accounts, { companyId: company.id, userId: user.id, correlationId }, "mobile-whatsapp-status");
    if (restoreCount) {
      accounts = await prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, userId: user.id, archivedAt: null },
        include: { _count: { select: { groups: true, contacts: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }
    const serialized = accounts.map(serializeMobileAccount);
    logger.info(
      serialized.length ? "WA_ACCOUNTS_REQUEST_SUCCESS" : "WA_ACCOUNTS_REQUEST_EMPTY",
      mobileWhatsAppAccountLogContext(correlationId, auth, startedAt, { route: "status", accountCount: serialized.length, restoreCount }),
    );
    return mobileSuccess({
      status: {
        connectedCount: serialized.filter((account) => account.status === "CONNECTED").length,
        reconnectingCount: serialized.filter((account) => ["CONNECTING", "RECONNECTING", "DEGRADED"].includes(account.status)).length,
        healthyCount: serialized.filter((account) => account.healthScore >= 70).length,
        totalGroupCount: serialized.reduce((sum, account) => sum + account.groupCount, 0),
        accounts: serialized,
      },
    });
  } catch (error) {
    logger.error("WA_ACCOUNTS_REQUEST_ERROR", error, {
      correlationId,
      route: "status",
      durationMs: Date.now() - startedAt,
    });
    return mobileSafeError(error);
  }
}
