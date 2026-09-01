import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { requestId } from "@/server/security/admin-request";
import { updateWhatsAppIngestionGroup } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

const schema = z.object({
  ingestionEnabled: z.boolean().optional(),
  approvalConfirmed: z.boolean().optional(),
  autoPublicationEnabled: z.boolean().optional(),
  manualReviewRequired: z.boolean().optional(),
  minimumConfidence: z.number().int().min(50).max(100).optional(),
  sectorHint: z.enum(["GENERAL_LOGISTICS", "HOME_MOVING", "PARTIAL_LOAD", "HEAVY_HAUL", "MIXED", "UNKNOWN"]).optional(),
  paused: z.boolean().optional(),
  reason: z.string().trim().min(5).max(500),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestIdentifier = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.whatsappIngestion.update", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "WHATSAPP_INGESTION_GROUP_UPDATE_INVALID", issues: parsed.error.issues, requestId: requestIdentifier }, { status: 400 });
    const { id } = await params;
    const before = await prisma.whatsAppGroup.findFirst({
      where: { id, isArchived: false, account: { userId: admin.user.id, archivedAt: null } },
    });
    const updated = await updateWhatsAppIngestionGroup(id, parsed.data, admin.user.id);
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "whatsapp.ingestion_source.updated",
      entityType: "WhatsAppGroup",
      entityId: id,
      before: before ?? undefined,
      after: updated,
      reason: parsed.data.reason,
      requestId: requestIdentifier,
    });
    return NextResponse.json({ group: updated }, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestIdentifier } });
  } catch (error) {
    return whatsappIngestionAdminError(error, requestIdentifier);
  }
}
