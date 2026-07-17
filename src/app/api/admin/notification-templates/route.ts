import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { notificationEventDefinition } from "@/server/notifications/registry";
import { validateTemplateSource } from "@/server/notifications/template-policy";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({
  scopeKey: z.string().min(1).max(120).default("GLOBAL"),
  eventType: z.string().min(3).max(120),
  channel: z.enum(["IN_APP", "EMAIL", "ANDROID_PUSH", "IOS_PUSH", "WEB_PUSH", "SMS_FUTURE"]),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  name: z.string().min(2).max(160),
  subject: z.string().max(200).optional(),
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(20_000),
  requiredVariables: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]*$/)).max(50).default([]),
});

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin("platform:read", request);
    const url = new URL(request.url);
    const eventType = url.searchParams.get("eventType") || undefined;
    const templates = await prisma.notificationTemplate.findMany({
      where: eventType ? { eventType } : {},
      orderBy: [{ eventType: "asc" }, { channel: "asc" }, { locale: "asc" }, { version: "desc" }],
      take: 500,
    });
    return NextResponse.json({ templates });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_TEMPLATES_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin("operations:manage", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_INVALID", issues: parsed.error.issues }, { status: 400 });
    const definition = notificationEventDefinition(parsed.data.eventType);
    const validation = validateTemplateSource(parsed.data);
    const missingRequired = definition.requiredVariables.filter((variable) => !parsed.data.requiredVariables.includes(variable));
    if (!validation.valid || missingRequired.length) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_INVALID", undeclared: validation.undeclared, missingRequired }, { status: 400 });
    const latest = await prisma.notificationTemplate.findFirst({
      where: { scopeKey: parsed.data.scopeKey, eventType: parsed.data.eventType, channel: parsed.data.channel, locale: parsed.data.locale },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const template = await prisma.notificationTemplate.create({
      data: { ...parsed.data, version: (latest?.version ?? 0) + 1, requiredVariables: parsed.data.requiredVariables, status: "DRAFT", isActive: false },
    });
    await writeAuditLog(request, {
      companyId: admin.company.id,
      userId: admin.user.id,
      actorType: "PLATFORM_ADMIN",
      action: "notification.template.created",
      entityType: "NotificationTemplate",
      entityId: template.id,
      metadata: { eventType: template.eventType, channel: template.channel, locale: template.locale, version: template.version },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_TEMPLATE_CREATE_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}
