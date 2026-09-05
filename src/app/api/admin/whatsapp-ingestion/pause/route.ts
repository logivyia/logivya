import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { writeAuditLog } from "@/server/security/audit";
import { requestId } from "@/server/security/admin-request";
import { updateWhatsAppIngestionControl } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

const schema = z
  .object({
    reason: z.string().trim().min(5).max(500),
    emergency: z.boolean().default(false),
  })
  .strict();

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "WHATSAPP_INGESTION_PAUSE_REASON_REQUIRED", requestId: id },
        { status: 400 },
      );
    const admin = await requireCriticalAdminAction(
      request,
      "admin.whatsappIngestion.update",
      parsed.data.reason,
    );
    const control = await updateWhatsAppIngestionControl({
      globallyPaused: true,
      emergencyKillSwitch: parsed.data.emergency,
      pauseReason: parsed.data.reason,
      actorUserId: admin.user.id,
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: parsed.data.emergency
        ? "whatsapp.ingestion.emergency_stopped"
        : "whatsapp.ingestion.paused",
      entityType: "WhatsAppIngestionControl",
      entityId: "global",
      reason: parsed.data.reason,
      requestId: id,
    });
    return NextResponse.json(
      { control },
      { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } },
    );
  } catch (error) {
    return whatsappIngestionAdminError(error, id);
  }
}
