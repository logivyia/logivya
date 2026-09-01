import { NextResponse } from "next/server";
import type { WhatsAppIngestionStatus } from "@prisma/client";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId } from "@/server/security/admin-request";
import { listWhatsAppIngestionReview } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

export const dynamic = "force-dynamic";

const allowedStatuses = new Set<WhatsAppIngestionStatus>(["PENDING_REVIEW", "AUTO_PUBLISHED", "MANUALLY_PUBLISHED", "REJECTED", "DUPLICATE", "FAILED"]);

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.whatsappIngestion.read", request);
    const url = new URL(request.url);
    const requested = url.searchParams.get("status")?.toUpperCase() as WhatsAppIngestionStatus | undefined;
    const status = requested && allowedStatuses.has(requested) ? requested : undefined;
    const result = await listWhatsAppIngestionReview({ ownerUserId: admin.user.id, status, limit: Number(url.searchParams.get("limit") || 50), cursor: url.searchParams.get("cursor") || undefined });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } });
  } catch (error) {
    return whatsappIngestionAdminError(error, id);
  }
}
