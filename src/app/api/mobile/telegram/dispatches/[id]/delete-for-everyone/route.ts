import { mobileSuccess } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { telegramSafeError } from "@/server/telegram/response";
import { callTelegramWorker } from "@/server/telegram/worker-client";

type DeleteForEveryoneResult = {
  requestedAt: string;
  completedAt: string | null;
  total: number;
  deleted: number;
  failed: number;
  pending: number;
  alreadyDeleted: number;
  canRetry: boolean;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const { id } = await context.params;
    await enforceOperationRateLimit({
      scope: "telegram.delete-everyone",
      subject: `${company.id}:${user.id}`,
      maxAttempts: 30,
      windowMs: 10 * 60_000,
      request,
    });
    const result = await callTelegramWorker<DeleteForEveryoneResult>(
      `/dispatches/${id}/delete-for-everyone`,
      {
        body: { companyId: company.id, userId: user.id },
        timeoutMs: 180_000,
      },
    );
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "telegram.dispatch.delete_for_everyone_requested",
      entityType: "TelegramDispatch",
      entityId: id,
      after: result,
    }).catch((error) =>
      logger.error("telegram.delete_audit_failed", error, { dispatchId: id }),
    );
    return mobileSuccess(result);
  } catch (error) {
    return telegramSafeError(error);
  }
}
