import { NextResponse } from "next/server";
import { logger } from "@/server/observability/logger";

export class SupportDomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
    public readonly retryAfter?: number,
  ) {
    super(code);
    this.name = "SupportDomainError";
  }
}

export function supportErrorFromUnknown(error: unknown, fallback = "SUPPORT_REQUEST_FAILED") {
  if (error instanceof SupportDomainError) return error;
  const code = error instanceof Error ? error.message : fallback;
  if (code === "UNAUTHORIZED") return new SupportDomainError("UNAUTHORIZED", 401);
  if (code === "FORBIDDEN") return new SupportDomainError("SUPPORT_ADMIN_REQUIRED", 403);
  if (code === "RATE_LIMITED" || code === "ADMIN_RATE_LIMITED") return new SupportDomainError("SUPPORT_RATE_LIMITED", 429, undefined, 60);
  if (code === "ADMIN_RATE_LIMIT_UNAVAILABLE") return new SupportDomainError("SUPPORT_DEPENDENCY_UNAVAILABLE", 503, undefined, 30);
  if (code === "CSRF_REJECTED") return new SupportDomainError("CSRF_REJECTED", 403);
  if (code === "ADMIN_RECENT_AUTH_REQUIRED" || code === "ADMIN_MFA_REQUIRED") return new SupportDomainError(code, 428);
  const developmentDetails = process.env.NODE_ENV !== "production" && error instanceof Error
    ? { debug: error.message.slice(0, 2_000) }
    : undefined;
  return new SupportDomainError(fallback, 500, developmentDetails);
}

export function supportErrorResponse(error: unknown, fallback?: string) {
  const resolved = supportErrorFromUnknown(error, fallback);
  if (resolved.status >= 500) {
    logger.error("support.request_failed", error, { errorCode: resolved.code });
  }
  const headers = resolved.retryAfter ? { "Retry-After": String(resolved.retryAfter) } : undefined;
  const developmentDetails = process.env.NODE_ENV !== "production" && error instanceof Error
    ? { debug: error.message.slice(0, 240) }
    : null;
  return NextResponse.json(
    { error: resolved.code, details: resolved.details ?? developmentDetails },
    { status: resolved.status, headers },
  );
}
