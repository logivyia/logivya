import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId } from "@/server/security/admin-request";
import { whatsappIngestionHealth } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.whatsappIngestion.read", request);
    return NextResponse.json(await whatsappIngestionHealth(admin.user.id), { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } });
  } catch (error) {
    return whatsappIngestionAdminError(error, id);
  }
}
