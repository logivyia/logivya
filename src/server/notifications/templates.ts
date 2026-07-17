import type { NotificationChannel } from "@prisma/client";
import { prisma } from "@/server/db";
import { renderText, resolveTemplateVariable } from "@/server/notifications/template-policy";

export { renderText, validateTemplateSource } from "@/server/notifications/template-policy";

export type NotificationContent = {
  title: string;
  message: string;
  subject?: string;
};

type RenderTemplateInput = {
  eventType: string;
  channel: NotificationChannel;
  locale: string;
  variables: Record<string, unknown>;
  fallback: NotificationContent;
};

export async function renderNotificationTemplate(input: RenderTemplateInput): Promise<NotificationContent> {
  const template = await prisma.notificationTemplate.findFirst({
    where: {
      scopeKey: "GLOBAL",
      eventType: input.eventType,
      channel: input.channel,
      locale: normalizeLocale(input.locale),
      isActive: true,
      status: "APPROVED",
    },
    orderBy: { version: "desc" },
  });
  if (!template) return input.fallback;

  const required = Array.isArray(template.requiredVariables)
    ? template.requiredVariables.filter((value): value is string => typeof value === "string")
    : [];
  const missing = required.filter((key) => resolveTemplateVariable(input.variables, key) === undefined);
  if (missing.length) throw new Error("NOTIFICATION_TEMPLATE_VARIABLES_MISSING");

  return {
    title: renderText(template.title || input.fallback.title, input.variables),
    subject: renderText(template.subject || input.fallback.subject || template.title || input.fallback.title, input.variables),
    message: renderText(template.body, input.variables),
  };
}

function normalizeLocale(locale: string) {
  return (locale || "tr").toLowerCase().split("-")[0];
}
