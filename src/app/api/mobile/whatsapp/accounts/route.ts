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
    const showArchived = new URL(request.url).searchParams.get("archived") === "true";
    logger.info("WA_ACCOUNTS_REQUEST_START", mobileWhatsAppAccountLogContext(correlationId, auth, startedAt, { archived: showArchived }));
    let accounts = await prisma.whatsAppAccount.findMany({
      where: { companyId: company.id, userId: user.id, ...(showArchived ? {} : { archivedAt: null }) },
      include: { _count: { select: { groups: true, contacts: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const restoreCount = showArchived
      ? 0
      : await requestWhatsAppSessionRestoreWithinTimeout(accounts, { companyId: company.id, userId: user.id, correlationId }, "mobile-whatsapp-accounts");
    if (restoreCount) {
      accounts = await prisma.whatsAppAccount.findMany({
        where: { companyId: company.id, userId: user.id, archivedAt: null },
        include: { _count: { select: { groups: true, contacts: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }
    logger.info(
      accounts.length ? "WA_ACCOUNTS_REQUEST_SUCCESS" : "WA_ACCOUNTS_REQUEST_EMPTY",
      mobileWhatsAppAccountLogContext(correlationId, auth, startedAt, { accountCount: accounts.length, restoreCount }),
    );
    return mobileSuccess({ accounts: accounts.map(serializeMobileAccount) });
  } catch (error) {
    logger.error("WA_ACCOUNTS_REQUEST_ERROR", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
    });
    return mobileSafeError(error);
  }
}
