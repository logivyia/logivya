import { randomUUID } from "node:crypto";
import { normalizeCorrelationId } from "@logivya/logging";

export type RequestObservabilityIds = {
  requestId: string;
  correlationId: string;
  traceId?: string;
};

export function requestObservabilityIds(request: Request): RequestObservabilityIds {
  const fallbackRequestId = randomUUID();
  const requestId = normalizeCorrelationId(request.headers.get("x-request-id"), fallbackRequestId);
  const correlationId = normalizeCorrelationId(request.headers.get("x-correlation-id"), requestId);
  const traceParent = request.headers.get("traceparent")?.trim();
  const traceId = traceParent?.match(/^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i)?.[1];
  return { requestId, correlationId, ...(traceId ? { traceId } : {}) };
}

export function requestCorrelationId(request: Request) {
  return requestObservabilityIds(request).correlationId;
}

export function requestLogContext(request: Request) {
  const ids = requestObservabilityIds(request);
  return {
    ...ids,
    route: new URL(request.url).pathname,
    method: request.method,
    platform: request.headers.get("x-client-platform") || "web",
    appVersion: request.headers.get("x-logivya-app-version") || undefined,
  };
}
