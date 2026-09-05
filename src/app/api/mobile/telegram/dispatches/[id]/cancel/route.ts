import { mobileSuccess } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { cancelOwnedTelegramDispatch } from "@/server/telegram/dispatch";
import { telegramSafeError } from "@/server/telegram/response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const { id } = await context.params;
    const result = await cancelOwnedTelegramDispatch(id, user.id, company.id);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "telegram.dispatch.canceled", entityType: "TelegramDispatch", entityId: id })
      .catch((error) => logger.error("telegram.cancel_audit_failed", error, { dispatchId: id }));
    return mobileSuccess(result);
  } catch (error) {
    return telegramSafeError(error);
  }
}

