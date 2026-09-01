import { z } from "zod";

import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { requireOwnedTelegramAccount } from "@/server/telegram/accounts";
import { maskTelegramPhone, normalizeTelegramPhone } from "@/server/telegram/phone";
import { telegramSafeError } from "@/server/telegram/response";
import { callTelegramWorker } from "@/server/telegram/worker-client";

const authSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("phone"), value: z.string().min(8).max(24) }),
  z.object({ step: z.literal("code"), value: z.string().trim().min(2).max(12) }),
  z.object({ step: z.literal("password"), value: z.string().min(1).max(256) }),
  z.object({ step: z.literal("email"), value: z.string().email().max(254) }),
  z.object({ step: z.literal("email_code"), value: z.string().trim().min(2).max(16) }),
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const { id } = await context.params;
    await requireOwnedTelegramAccount(id, user.id, company.id);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = authSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const value = parsed.data.step === "phone" ? normalizeTelegramPhone(parsed.data.value) : parsed.data.value;
    const result = await callTelegramWorker<{ authState: string; status: string }>(`/accounts/${id}/auth`, {
      body: { step: parsed.data.step, value },
    });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: `telegram.auth.${parsed.data.step}.submitted`,
      entityType: "TelegramAccount",
      entityId: id,
      after: parsed.data.step === "phone" ? { phoneNumber: maskTelegramPhone(value), authState: result.authState } : { authState: result.authState },
    }).catch((error) => logger.error("telegram.auth_audit_failed", error, { accountId: id, step: parsed.data.step }));
    return mobileSuccess(result);
  } catch (error) {
    return telegramSafeError(error);
  }
}

