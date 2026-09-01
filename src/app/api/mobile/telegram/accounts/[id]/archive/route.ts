import { mobileSuccess } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { archiveOwnedTelegramAccount, requireOwnedTelegramAccount } from "@/server/telegram/accounts";
import { telegramSafeError } from "@/server/telegram/response";
import { callTelegramWorker } from "@/server/telegram/worker-client";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const { id } = await context.params;
    await requireOwnedTelegramAccount(id, user.id, company.id);
    await callTelegramWorker(`/accounts/${id}/logout`, { body: {} });
    await archiveOwnedTelegramAccount(id, user.id, company.id);
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "telegram.account.archived",
      entityType: "TelegramAccount",
      entityId: id,
    }).catch((error) => logger.error("telegram.archive_audit_failed", error, { accountId: id }));
    return mobileSuccess({ archived: true });
  } catch (error) {
    return telegramSafeError(error);
  }
}

