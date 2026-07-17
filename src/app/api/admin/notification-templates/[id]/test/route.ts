import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db";
import { sendTemplateEmailSafely } from "@/server/email/service";
import { sendPushToUserStrict } from "@/server/notifications/service";
import { renderText, resolveTemplateVariable } from "@/server/notifications/template-policy";
import { sendWebPushToUser } from "@/server/notifications/web-push";
import { writeAuditLog } from "@/server/security/audit";

const schema = z.object({ variables: z.record(z.string(), z.unknown()).default({}) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformAdmin("operations:manage", request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_INVALID" }, { status: 400 });
    const { id } = await params;
    const template = await prisma.notificationTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_NOT_FOUND" }, { status: 404 });
    const required = Array.isArray(template.requiredVariables) ? template.requiredVariables.filter((value): value is string => typeof value === "string") : [];
    const variables = safeVariables(required, parsed.data.variables);
    if (required.some((key) => resolveTemplateVariable(variables, key) === undefined)) return NextResponse.json({ error: "NOTIFICATION_TEMPLATE_VARIABLE_MISSING" }, { status: 400 });
    const content = { title: renderText(template.title || template.subject || "Logivya", variables), subject: renderText(template.subject || template.title || "Logivya", variables), message: renderText(template.body, variables) };
    let result: unknown;
    if (template.channel === "EMAIL") result = await sendTemplateEmailSafely({ to: admin.user.email, template: "notification_generic", companyId: admin.company.id, userId: admin.user.id, variables: { title: content.subject, message: content.message, openUrl: "", locale: template.locale } });
    else if (template.channel === "ANDROID_PUSH" || template.channel === "IOS_PUSH") result = await sendPushToUserStrict({ companyId: admin.company.id, userId: admin.user.id, title: content.title, message: content.message, type: template.eventType, notificationId: `template-test:${template.id}`, platform: template.channel === "ANDROID_PUSH" ? "ANDROID" : "IOS" });
    else if (template.channel === "WEB_PUSH") result = await sendWebPushToUser({ companyId: admin.company.id, userId: admin.user.id, payload: { title: content.title, message: content.message, notificationId: `template-test:${template.id}`, type: template.eventType, deepLink: "/admin/notifications" } });
    else result = { previewOnly: true, content };
    await writeAuditLog(request, { companyId: admin.company.id, userId: admin.user.id, actorType: "PLATFORM_ADMIN", action: "notification.template.test_sent", entityType: "NotificationTemplate", entityId: id, metadata: { channel: template.channel, locale: template.locale, recipient: "AUTHORIZED_ADMIN_SELF" } });
    return NextResponse.json({ ok: true, result, preview: content });
  } catch (error) {
    const code = error instanceof Error ? error.message : "NOTIFICATION_TEMPLATE_TEST_FAILED";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500 });
  }
}

function safeVariables(required: string[], input: Record<string, unknown>) {
  const result = structuredClone(input);
  for (const key of required) {
    const parts = key.split(".");
    let target = result;
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts.at(-1)!] ??= `Sample ${key}`;
  }
  return result;
}
