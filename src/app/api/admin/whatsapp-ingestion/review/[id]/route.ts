import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId } from "@/server/security/admin-request";
import { getWhatsAppIngestionReview } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestIdentifier = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.whatsappIngestion.read", request);
    const { id } = await params;
    return NextResponse.json({ review: await getWhatsAppIngestionReview(id, admin.user.id) }, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestIdentifier } });
  } catch (error) {
    return whatsappIngestionAdminError(error, requestIdentifier);
  }
}
