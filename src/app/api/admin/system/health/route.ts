import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { getSystemHealthSnapshot } from "@/server/monitoring/health";
import { logger } from "@/server/observability/logger";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("admin.dashboard.read", request);
    const snapshot = await getSystemHealthSnapshot();
    const byId = Object.fromEntries(snapshot.services.map((service) => [service.id, service]));
    const messageQueue = snapshot.queues.find((queue) => queue.name === "logivya-message");
    return NextResponse.json({
      ...snapshot,
      app: snapshot.status,
      database: { status: byId.database?.state ?? "UNKNOWN", latencyMs: byId.database?.latencyMs ?? null },
      queue: { status: byId.queues?.state ?? "UNKNOWN", counts: messageQueue?.counts ?? {} },
      worker: byId.worker?.state ?? "UNKNOWN",
      storage: byId.storage?.state ?? "UNKNOWN",
      email: byId.email?.state ?? "UNKNOWN",
      errors: snapshot.incidents,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
    logger.error("admin.system_health.load_failed", error);
    return NextResponse.json({ error: "SYSTEM_HEALTH_LOAD_FAILED" }, { status: 500 });
  }
}
