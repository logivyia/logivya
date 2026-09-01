import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { requestId } from "@/server/security/admin-request";
import { listWhatsAppIngestionGroups } from "@/server/whatsapp-ingestion/admin";
import { whatsappIngestionAdminError } from "@/server/whatsapp-ingestion/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const admin = await requirePlatformAdmin("admin.whatsappIngestion.read", request);
    const url = new URL(request.url);
    const booleanValue = (name: string) => url.searchParams.has(name) ? url.searchParams.get(name) === "true" : undefined;
    const result = await listWhatsAppIngestionGroups({
      ownerUserId: admin.user.id,
      query: url.searchParams.get("q")?.trim() || undefined,
      enabled: booleanValue("enabled"),
      recommended: booleanValue("recommended"),
      limit: Number(url.searchParams.get("limit") || 100),
      cursor: url.searchParams.get("cursor") || undefined,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } });
  } catch (error) {
    return whatsappIngestionAdminError(error, id);
  }
}
