import { requireTelegramInternalAccess } from "@/server/telegram/access";
import { mobileSuccess, mobileError } from "@/server/mobile/response";
import { telegramSafeError } from "@/server/telegram/response";
import { setTelegramPublication } from "@/server/freight/telegram-publication";
import { writeAuditLog } from "@/server/security/audit";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, company } = await requireTelegramInternalAccess(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.enabled !== "boolean") return mobileError("VALIDATION_ERROR", "api.error.validation", { status: 400 });
    const result = await setTelegramPublication({ userId: user.id, companyId: company.id }, id, body.enabled);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "telegram.freight_publication.changed", entityType: "TelegramChat", entityId: id, after: result });
    return mobileSuccess(result);
  } catch (error) { return telegramSafeError(error); }
}
