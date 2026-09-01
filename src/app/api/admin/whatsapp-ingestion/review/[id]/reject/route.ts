import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { writeAuditLog } from "@/server/security/audit";
import { requestId } from "@/server/security/admin-request";
import { resolveWhatsAppIngestionReview } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

const schema = z.object({ reason: z.string().trim().min(5).max(1_000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestIdentifier = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.whatsappIngestion.update", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "WHATSAPP_INGESTION_REJECTION_REASON_REQUIRED", requestId: requestIdentifier }, { status: 400 });
    const { id } = await params;
    const review = await resolveWhatsAppIngestionReview({ id, actorUserId: admin.user.id, status: "REJECTED", note: parsed.data.reason });
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorType: "PLATFORM_ADMIN", action: "whatsapp.ingestion_review.rejected", entityType: "WhatsAppListingExtraction", entityId: id, reason: parsed.data.reason, requestId: requestIdentifier });
    return NextResponse.json({ review }, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestIdentifier } });
  } catch (error) {
    return whatsappIngestionAdminError(error, requestIdentifier);
  }
}
