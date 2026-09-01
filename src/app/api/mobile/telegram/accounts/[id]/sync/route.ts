import { mobileSuccess } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { requireOwnedTelegramAccount } from "@/server/telegram/accounts";
import { telegramSafeError } from "@/server/telegram/response";
import { callTelegramWorker } from "@/server/telegram/worker-client";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const { id } = await context.params;
    await requireOwnedTelegramAccount(id, user.id, company.id);
    const result = await callTelegramWorker<{ synced: number; sendable: number }>(`/accounts/${id}/sync`, { body: {}, timeoutMs: 60_000 });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "telegram.chats.synced",
      entityType: "TelegramAccount",
      entityId: id,
      after: result,
    }).catch((error) => logger.error("telegram.sync_audit_failed", error, { accountId: id }));
    return mobileSuccess(result);
  } catch (error) {
    return telegramSafeError(error);
  }
}

