import { NextResponse } from "next/server";

import { safeAdminError } from "@/server/security/admin-request";

export function whatsappIngestionAdminError(error: unknown, requestId: string) {
  const code = error instanceof Error ? error.message : "WHATSAPP_INGESTION_ADMIN_REQUEST_FAILED";
  const knownStatus = code.endsWith("_NOT_FOUND") ? 404
    : code.endsWith("_APPROVAL_REQUIRED") ? 409
      : code.endsWith("_REQUIRED") || code.endsWith("_INVALID") ? 400
        : null;
  if (knownStatus) return NextResponse.json({ error: code, requestId }, { status: knownStatus, headers: { "X-Request-Id": requestId } });
  const safe = safeAdminError(error, requestId);
  return NextResponse.json(safe.body, { status: safe.status, headers: { "X-Request-Id": requestId } });
}
