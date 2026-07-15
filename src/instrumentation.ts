import type { Instrumentation } from "next";
import { normalizeCorrelationId } from "@logivya/logging";

export function register() {
  // Reserved for runtime-specific telemetry providers.
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  try {
    const errorDigest = error && typeof error === "object" && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
    const fallbackId = errorDigest || crypto.randomUUID();
    const header = (name: string) => {
      const value = request.headers[name] ?? request.headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };
    const requestId = normalizeCorrelationId(header("x-request-id"), fallbackId);
    const correlationId = normalizeCorrelationId(header("x-correlation-id"), requestId);
    const route = request.path.split(/[?#]/, 1)[0] || context.routePath;
    const { logger } = await import("@/server/observability/logger");
    logger.error("web.request.unhandled_error", error, {
      requestId,
      correlationId,
      route,
      method: request.method,
      platform: header("x-client-platform") || "web",
      appVersion: header("x-logivya-app-version"),
      errorDigest,
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    });
  } catch {
    // Error reporting must never replace the original request error.
  }
};
