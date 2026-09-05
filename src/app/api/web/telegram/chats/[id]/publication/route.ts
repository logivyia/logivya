import { NextResponse } from "next/server";
import { requireWebTelegramAccess } from "@/server/web/communication-access";
import { webCommunicationSafeError } from "@/server/web/communication-response";
import { assertWebMutationOrigin } from "@/server/security/request-origin";
import { setTelegramPublication } from "@/server/freight/telegram-publication";
import { writeAuditLog } from "@/server/security/audit";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertWebMutationOrigin(request);
    const { user, company } = await requireWebTelegramAccess();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    const result = await setTelegramPublication({ userId: user.id, companyId: company.id }, id, body.enabled);
    await writeAuditLog(request, { companyId: company.id, userId: user.id, action: "telegram.freight_publication.changed", entityType: "TelegramChat", entityId: id, after: result });
    return NextResponse.json(result);
  } catch (error) { return webCommunicationSafeError(error); }
}
