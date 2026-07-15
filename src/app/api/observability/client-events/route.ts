import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/server/observability/logger";
import { keyedIdentifierHash } from "@/server/observability/privacy";
import { requestLogContext } from "@/server/observability/request-id";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { tryRecordSecurityEvent } from "@/server/security/events";

const schema = z.object({
  digest: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  name: z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9._-]*$/).optional(),
  source: z.enum(["segment-boundary", "global-boundary", "window-error", "unhandled-rejection"]),
  route: z.string().trim().min(1).max(300).regex(/^\/(?!\/)[^?#]*$/),
  platform: z.enum(["web", "mobile-web"]),
  appVersion: z.string().trim().min(1).max(80),
}).strict();

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) return new NextResponse(null, { status: 413 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    await enforceOperationRateLimit({
      scope: "client-error-report",
      subject: keyedIdentifierHash(forwarded) || "anonymous",
      maxAttempts: 20,
      windowMs: 5 * 60_000,
      request,
    });
  } catch {
    return new NextResponse(null, { status: 202 });
  }

  const context = { ...requestLogContext(request), ...parsed.data };
  logger.warn("web.client.error_reported", context);
  await tryRecordSecurityEvent({
    request,
    severity: "LOW",
    type: "CLIENT_ERROR_REPORTED",
    message: "A privacy-safe client error signal was received.",
    result: "FAILED",
    source: parsed.data.source,
    errorCode: parsed.data.digest,
    metadata: {
      route: parsed.data.route,
      errorName: parsed.data.name,
      platform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
    },
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
