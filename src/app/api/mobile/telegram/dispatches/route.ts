import { readMobileJson } from "@/server/mobile/request-json";
import { mobileSuccess, mobileValidationError } from "@/server/mobile/response";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { createTelegramDispatch, createTelegramDispatchSchema, listTelegramHistory } from "@/server/telegram/dispatch";
import { telegramSafeError } from "@/server/telegram/response";

export async function GET(request: Request) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const query = new URL(request.url).searchParams;
    return mobileSuccess(await listTelegramHistory({ companyId: company.id, userId: user.id, cursor: query.get("cursor") || undefined, take: Number(query.get("take") || 20) }));
  } catch (error) {
    return telegramSafeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const body = await readMobileJson(request);
    if (!body.ok) return body.response;
    const parsed = createTelegramDispatchSchema.safeParse(body.data);
    if (!parsed.success) return mobileValidationError(parsed.error);
    const result = await createTelegramDispatch({ companyId: company.id, userId: user.id, timezone: company.defaultTimezone, data: parsed.data });
    await writeAuditLog(request, {
      companyId: company.id,
      userId: user.id,
      action: "telegram.dispatch.created",
      entityType: "TelegramDispatch",
      entityId: result.dispatch.id,
      after: { scheduleType: result.dispatch.scheduleType, targetCount: result.dispatch.targets.length, duplicate: result.duplicate },
    }).catch((error) => logger.error("telegram.dispatch_audit_failed", error, { dispatchId: result.dispatch.id }));
    return mobileSuccess(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return telegramSafeError(error);
  }
}
