import { NextResponse } from "next/server";
import { z } from "zod";

import { adminSecurityEventPrivacyWhere } from "@/server/admin/message-privacy";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
  investigationNote: z.string().trim().min(5).max(1_000),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformAdmin("admin.security.read", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_SECURITY_EVENT_UPDATE" }, { status: 400 });
    const { id } = await params;
    const before = await prisma.securityEvent.findFirst({
      where: adminSecurityEventPrivacyWhere({ id }),
      select: { id: true, companyId: true, status: true, investigationNote: true, resolvedAt: true },
    });
    if (!before) return NextResponse.json({ error: "SECURITY_EVENT_NOT_FOUND" }, { status: 404 });
    const now = new Date();
    const event = await prisma.securityEvent.update({
      where: { id },
      data: {
        status: parsed.data.status,
        investigationNote: parsed.data.investigationNote,
        acknowledgedAt: before.status === "OPEN" ? now : undefined,
        acknowledgedByUserId: context.user.id,
        resolvedAt: parsed.data.status === "RESOLVED" || parsed.data.status === "DISMISSED" ? now : null,
      },
      select: {
        id: true,
        severity: true,
        type: true,
        result: true,
        status: true,
        errorCode: true,
        source: true,
        clientPlatform: true,
        appVersion: true,
        ipAddressMasked: true,
        userAgentSummary: true,
        acknowledgedAt: true,
        investigationNote: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
    await writeAuditLog(request, {
      companyId: before.companyId || context.company.id,
      userId: context.user.id,
      actorType: "PLATFORM_ADMIN",
      actorEmail: context.user.email,
      action: "ADMIN_SECURITY_EVENT_STATUS_CHANGED",
      result: "SUCCESS",
      reason: parsed.data.investigationNote,
      entityType: "SecurityEvent",
      entityId: id,
      before: { status: before.status, investigationNote: before.investigationNote, resolvedAt: before.resolvedAt },
      after: { status: event.status, investigationNote: event.investigationNote, resolvedAt: event.resolvedAt },
    });
    return NextResponse.json({ event });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
    logger.error("admin.security_event.update_failed", error);
    return NextResponse.json({ error: "SECURITY_EVENT_UPDATE_FAILED" }, { status: 500 });
  }
}
