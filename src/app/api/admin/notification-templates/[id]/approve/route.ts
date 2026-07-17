import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/security/audit";
import { notificationEventDefinition } from "@/server/notifications/registry";
import { validateTemplateSource } from "@/server/notifications/template-policy";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformAdmin("operations:manage", request);
    const { id } = await params;
    const source = await prisma.notificationTemplate.findUniqueOrThrow({ where: { id } });
    const requiredVariables = Array.isArray(source.requiredVariables) ? source.requiredVariables.filter((value): value is string => typeof value === "string") : [];
    const validation = validateTemplateSource({ ...source, requiredVariables });
    const missingRequired = notificationEventDefinition(source.eventType).requiredVariables.filter((variable) => !requiredVariables.includes(variable));
    if (!validation.valid || missingRequired.length) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_INVALID", undeclared: validation.undeclared, missingRequired }, { status: 400 });
    const template = await prisma.$transaction(async (tx) => {
      await tx.notificationTemplate.updateMany({
        where: { scopeKey: source.scopeKey, eventType: source.eventType, channel: source.channel, locale: source.locale, isActive: true },
        data: { isActive: false },
      });
      return tx.notificationTemplate.update({
        where: { id },
        data: { status: "APPROVED", isActive: true, approvedBy: admin.user.id, approvedAt: new Date() },
      });
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.template.approved",
      entityType: "NotificationTemplate",
      entityId: template.id,
      metadata: { eventType: template.eventType, channel: template.channel, locale: template.locale, version: template.version },
    });
    return NextResponse.json({ template });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_TEMPLATE_APPROVE_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}
