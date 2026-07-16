import { timingSafeEqual } from "node:crypto";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";

function equalSecret(left: string, right: string) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

export async function requireMonitoringAccess(request: Request) {
  const configured = process.env.MONITORING_INTERNAL_TOKEN?.trim();
  const supplied = request.headers.get("x-logivya-monitoring-token")?.trim();
  if (configured && supplied && equalSecret(configured, supplied)) return { source: "internal" as const };
  const context = await requirePlatformAdmin("admin.dashboard.read", request);
  return { source: "platform-admin" as const, context };
}
