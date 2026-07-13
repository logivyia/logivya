import { randomUUID } from "node:crypto";

export function requestCorrelationId(request: Request) {
  return request.headers.get("x-request-id")?.slice(0, 128) || randomUUID();
}
