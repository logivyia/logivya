import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { INCIDENT_STATUSES, updateIncident } from "@/server/monitoring/incidents";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  note: z.string().trim().min(5).max(1_000),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformAdmin("admin.dashboard.read", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INCIDENT_UPDATE_INVALID" }, { status: 400 });
    const { id } = await context.params;
    const incident = await prisma.incidentLog.findUnique({ where: { id } });
    if (!incident) return NextResponse.json({ error: "INCIDENT_NOT_FOUND" }, { status: 404 });
    const updated = await updateIncident({ incident, status: parsed.data.status, note: parsed.data.note, actorUserId: admin.user.id });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      actorEmail: admin.user.email,
      action: "incident.status_updated",
      entityType: "IncidentLog",
      entityId: incident.id,
      before: { status: incident.status },
      after: { status: updated.status, note: parsed.data.note },
    });
    return NextResponse.json({ incident: updated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
    if (code.startsWith("INCIDENT_")) return NextResponse.json({ error: code }, { status: 409 });
    logger.error("admin.incident.update_failed", error);
    return NextResponse.json({ error: "INCIDENT_UPDATE_FAILED" }, { status: 500 });
  }
}
