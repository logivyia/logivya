import type { Company, CompanyUser, User } from "@prisma/client";

import { logger } from "@/server/observability/logger";
import { requestWhatsAppSessionRestoreForAccounts, type WhatsAppRestoreAccount } from "@/server/whatsapp/session-restore";

const DEFAULT_RESTORE_TIMEOUT_MS = 2500;

export function mobileWhatsAppCorrelationId(request: Request) {
  return (
    request.headers.get("x-correlation-id") ||
    request.headers.get("x-request-id") ||
    `mobile-wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export function mobileWhatsAppAccountLogContext(
  correlationId: string,
  auth: { user: User; company: Company; membership: CompanyUser },
  startedAt: number,
  extra: Record<string, unknown> = {},
) {
  return {
    correlationId,
    userId: auth.user.id,
    companyId: auth.company.id,
    email: auth.user.email,
    role: auth.membership.role,
    durationMs: Date.now() - startedAt,
    ...extra,
  };
}

export async function requestWhatsAppSessionRestoreWithinTimeout(
  accounts: WhatsAppRestoreAccount[],
  context: { companyId: string; userId: string; correlationId: string },
  source: string,
) {
  if (!accounts.length) return 0;

  const timeoutMs = Number(process.env.MOBILE_WA_ACCOUNT_RESTORE_TIMEOUT_MS || DEFAULT_RESTORE_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return requestWhatsAppSessionRestoreForAccounts(accounts, context, source).catch((error) => {
      logger.error("WA_ACCOUNTS_REQUEST_ERROR", error, {
        ...context,
        source,
        reason: "restore_failed",
      });
      return 0;
    });
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<number>((resolve) => {
    timeout = setTimeout(() => {
      logger.warn("WA_ACCOUNTS_RESTORE_TIMEOUT", {
        ...context,
        source,
        accountCount: accounts.length,
        timeoutMs,
      });
      resolve(0);
    }, timeoutMs);
  });

  const restorePromise = requestWhatsAppSessionRestoreForAccounts(accounts, context, source)
    .catch((error) => {
      logger.error("WA_ACCOUNTS_REQUEST_ERROR", error, {
        ...context,
        source,
        reason: "restore_failed",
      });
      return 0;
    })
    .finally(() => {
      if (timeout) clearTimeout(timeout);
    });

  return Promise.race([restorePromise, timeoutPromise]);
}
