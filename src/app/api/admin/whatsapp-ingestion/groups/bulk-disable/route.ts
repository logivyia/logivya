import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { writeAuditLog } from "@/server/security/audit";
import { requestId } from "@/server/security/admin-request";
import { bulkUpdateWhatsAppIngestionGroups } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500), reason: z.string().trim().min(5).max(500) }).strict();

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.whatsappIngestion.update", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "WHATSAPP_INGESTION_BULK_DISABLE_INVALID", issues: parsed.error.issues, requestId: id }, { status: 400 });
    const result = await bulkUpdateWhatsAppIngestionGroups({ ...parsed.data, enabled: false, actorUserId: admin.user.id });
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorType: "PLATFORM_ADMIN", action: "whatsapp.ingestion_sources.bulk_disabled", entityType: "WhatsAppGroup", entityId: "bulk", reason: parsed.data.reason, metadata: { ids: parsed.data.ids, updated: result.updated }, requestId: id });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } });
  } catch (error) {
    return whatsappIngestionAdminError(error, id);
  }
}
