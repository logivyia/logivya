import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCriticalAdminAction } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { requestId, safeAdminError } from "@/server/security/admin-request";
import { notificationEventDefinition } from "@/server/notifications/registry";
import { validateTemplateSource } from "@/server/notifications/template-policy";

const schema = z.object({ reason: z.string().trim().min(5).max(500) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "NOTIFICATION_APPROVAL_REASON_REQUIRED" },
        { status: 400 },
      );
    const admin = await requireCriticalAdminAction(
      request,
      "admin.notifications.update",
      parsed.data.reason,
    );
    const { id } = await params;
    const source = await prisma.notificationTemplate.findUniqueOrThrow({
      where: { id },
    });
    const requiredVariables = Array.isArray(source.requiredVariables)
      ? source.requiredVariables.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const validation = validateTemplateSource({ ...source, requiredVariables });
    const missingRequired = notificationEventDefinition(
      source.eventType,
    ).requiredVariables.filter(
      (variable) => !requiredVariables.includes(variable),
    );
    if (!validation.valid || missingRequired.length)
      return NextResponse.json(
        {
          error: "NOTIFICATION_TEMPLATE_INVALID",
          undeclared: validation.undeclared,
          missingRequired,
        },
        { status: 400 },
      );
    const template = await prisma.$transaction(async (tx) => {
      await tx.notificationTemplate.updateMany({
        where: {
          scopeKey: source.scopeKey,
          eventType: source.eventType,
          channel: source.channel,
          locale: source.locale,
          isActive: true,
        },
        data: { isActive: false },
      });
      return tx.notificationTemplate.update({
        where: { id },
        data: {
          status: "APPROVED",
          isActive: true,
          approvedBy: admin.user.id,
          approvedAt: new Date(),
        },
      });
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.template.approved",
      reason: parsed.data.reason,
      entityType: "NotificationTemplate",
      entityId: template.id,
      metadata: {
        eventType: template.eventType,
        channel: template.channel,
        locale: template.locale,
        version: template.version,
      },
    });
    return NextResponse.json({ template });
  } catch (error) {
    const safe = safeAdminError(error, requestId(request));
    return NextResponse.json(safe.body, { status: safe.status });
  }
}
