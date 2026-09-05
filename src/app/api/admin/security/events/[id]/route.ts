import { NextResponse } from "next/server";
import { z } from "zod";

import { adminSecurityEventPrivacyWhere } from "@/server/admin/message-privacy";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";

const schema = z
  .object({
    status: z.enum(["ACKNOWLEDGED", "RESOLVED", "DISMISSED"]),
    investigationNote: z.string().trim().min(5).max(1_000),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = requestId(request);
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "INVALID_SECURITY_EVENT_UPDATE", requestId: operationId },
        { status: 400 },
      );
    const context = await requireCriticalAdminAction(
      request,
      "admin.security.update",
      parsed.data.investigationNote,
    );
    const { id } = await params;
    const before = await prisma.securityEvent.findFirst({
      where: adminSecurityEventPrivacyWhere({ id }),
      select: {
        id: true,
        companyId: true,
        status: true,
        investigationNote: true,
        resolvedAt: true,
      },
    });
    if (!before)
      return NextResponse.json(
        { error: "SECURITY_EVENT_NOT_FOUND", requestId: operationId },
        { status: 404 },
      );
    if (before.status === parsed.data.status)
      return NextResponse.json({
        event: before,
        idempotent: true,
        requestId: operationId,
      });
    const allowedTransitions: Record<string, string[]> = {
      OPEN: ["ACKNOWLEDGED", "RESOLVED", "DISMISSED"],
      ACKNOWLEDGED: ["RESOLVED", "DISMISSED"],
    };
    if (!allowedTransitions[before.status]?.includes(parsed.data.status)) {
      return NextResponse.json(
        { error: "SECURITY_EVENT_NOT_ACTIONABLE", requestId: operationId },
        { status: 409 },
      );
    }
    const now = new Date();
    const transition = await prisma.securityEvent.updateMany({
      where: { id, status: before.status },
      data: {
        status: parsed.data.status,
        investigationNote: parsed.data.investigationNote,
        acknowledgedAt: before.status === "OPEN" ? now : undefined,
        acknowledgedByUserId: context.user.id,
        resolvedAt:
          parsed.data.status === "RESOLVED" ||
          parsed.data.status === "DISMISSED"
            ? now
            : null,
      },
    });
    if (transition.count !== 1) {
      const current = await prisma.securityEvent.findFirst({
        where: adminSecurityEventPrivacyWhere({ id }),
        select: { id: true, status: true },
      });
      if (current?.status === parsed.data.status) {
        return NextResponse.json({
          event: current,
          idempotent: true,
          requestId: operationId,
        });
      }
      return NextResponse.json(
        { error: "SECURITY_EVENT_STATE_CHANGED", requestId: operationId },
        { status: 409 },
      );
    }
    const event = await prisma.securityEvent.findUniqueOrThrow({
      where: { id },
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
      before: {
        status: before.status,
        investigationNote: before.investigationNote,
        resolvedAt: before.resolvedAt,
      },
      after: {
        status: event.status,
        investigationNote: event.investigationNote,
        resolvedAt: event.resolvedAt,
      },
    });
    return NextResponse.json({ event, requestId: operationId });
  } catch (error) {
    logger.error("admin.security_event.update_failed", error);
    const safe = safeAdminError(error, operationId);
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
