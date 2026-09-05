import { NextResponse } from "next/server";
import { z } from "zod";

import { logger } from "@/server/observability/logger";
import { keyedIdentifierHash } from "@/server/observability/privacy";
import { requestLogContext } from "@/server/observability/request-id";
import { enforceOperationRateLimit } from "@/server/security/operation-rate-limit";
import { tryRecordSecurityEvent } from "@/server/security/events";
import { readBoundedRequestText, RequestBodyError } from "@/server/security/request-body";

const schema = z.object({
  digest: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  name: z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9._-]*$/).optional(),
  source: z.enum([
    "segment-boundary",
    "global-boundary",
    "window-error",
    "unhandled-rejection",
    "mobile-root-boundary",
  ]),
  route: z.string().trim().min(1).max(300).regex(/^\/(?!\/)[^?#]*$/),
  platform: z.enum(["web", "mobile-web", "android", "ios"]),
  appVersion: z.string().trim().min(1).max(80),
  buildNumber: z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9._-]+$/).optional(),
  recoveryId: z
    .string()
    .trim()
    .min(16)
    .max(100)
    .regex(/^mobile-recovery-[A-Za-z0-9-]+$/)
    .optional(),
  failureStage: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
}).strict();

export async function POST(request: Request) {
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
    void request.body?.cancel().catch(() => undefined);
    return new NextResponse(null, { status: 202 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await readBoundedRequestText(request, 4_096, 5_000));
  } catch (error) {
    return new NextResponse(null, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const context = { ...requestLogContext(request), ...parsed.data };
  logger.warn(
    parsed.data.platform === "android" || parsed.data.platform === "ios"
      ? "mobile.client.recovery_reported"
      : "web.client.error_reported",
    context,
  );
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
      buildNumber: parsed.data.buildNumber,
      recoveryId: parsed.data.recoveryId,
      failureStage: parsed.data.failureStage,
    },
  });
  return NextResponse.json(
    {
      accepted: true,
      correlationId: context.correlationId,
      requestId: context.requestId,
      recoveryId: parsed.data.recoveryId ?? context.recoveryId ?? null,
    },
    { status: 202 },
  );
}
