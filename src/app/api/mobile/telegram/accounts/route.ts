import { z } from "zod";

import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { createOwnedTelegramAccount, listOwnedTelegramAccounts } from "@/server/telegram/accounts";
import { telegramSafeError } from "@/server/telegram/response";
import { callTelegramWorker } from "@/server/telegram/worker-client";

const createSchema = z.object({ label: z.string().trim().min(1).max(80).optional() });

export async function GET(request: Request) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    return mobileSuccess({ accounts: await listOwnedTelegramAccounts(user.id, company.id) });
  } catch (error) {
    logger.error("telegram.account_list_request_failed", error);
    return telegramSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = createSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const { account, created } = await createOwnedTelegramAccount({ ownerUserId: user.id, companyId: company.id, label: parsed.data.label });
    await callTelegramWorker(`/accounts/${account.id}/start`, { body: {} }).catch(async (error) => {
      logger.error("telegram.account_worker_start_failed", error, { accountId: account.id });
    });
    if (created) {
      await writeAuditLog(request, {
        companyId: company.id,
        userId: user.id,
        action: "telegram.account.created",
        entityType: "TelegramAccount",
        entityId: account.id,
        after: { provider: "tdlib", internalOnly: true },
      }).catch((error) => logger.error("telegram.account_create_audit_failed", error, { accountId: account.id }));
    }
    return mobileSuccess({ account, reused: !created }, { status: created ? 201 : 200 });
  } catch (error) {
    logger.error("telegram.account_create_request_failed", error);
    return telegramSafeError(error);
  }
}
