import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import {
  INCIDENT_STATUSES,
  updateIncident,
} from "@/server/monitoring/incidents";
import { logger } from "@/server/observability/logger";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  note: z.string().trim().min(5).max(1_000),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const operationId = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "INCIDENT_UPDATE_INVALID", requestId: operationId },
        { status: 400 },
      );
    const admin = await requireCriticalAdminAction(
      request,
      "admin.incidents.update",
      parsed.data.note,
    );
    const { id } = await context.params;
    const incident = await prisma.incidentLog.findUnique({ where: { id } });
    if (!incident)
      return NextResponse.json(
        { error: "INCIDENT_NOT_FOUND", requestId: operationId },
        { status: 404 },
      );
    if (incident.status === parsed.data.status) {
      return NextResponse.json({
        incident,
        idempotent: true,
        requestId: operationId,
      });
    }
    const updated = await updateIncident({
      incident,
      status: parsed.data.status,
      note: parsed.data.note,
      actorUserId: admin.user.id,
    });
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
    return NextResponse.json({
      incident: {
        id: updated.id,
        severity: updated.severity,
        title: updated.title,
        status: updated.status,
        startedAt: updated.startedAt,
        resolvedAt: updated.resolvedAt,
      },
      requestId: operationId,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code.startsWith("INCIDENT_"))
      return NextResponse.json(
        { error: code, requestId: operationId },
        { status: 409 },
      );
    logger.error("admin.incident.update_failed", error);
    const safe = safeAdminError(error, operationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
