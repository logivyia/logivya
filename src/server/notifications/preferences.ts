import type { NotificationCategory, NotificationChannel } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";

export const NOTIFICATION_CATEGORIES = [
  "ACCOUNT", "SECURITY", "SUPPORT", "SUBSCRIPTION", "BILLING", "INVITATION", "WHATSAPP", "MESSAGE",
  "SYSTEM", "MARKETING", "COMPLIANCE", "ADMINISTRATION", "BACKUP", "INCIDENT",
] as const satisfies readonly NotificationCategory[];

export const USER_NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "ANDROID_PUSH", "IOS_PUSH", "WEB_PUSH"] as const satisfies readonly NotificationChannel[];

export const notificationPreferencePatchSchema = z.object({
  preferences: z.array(z.object({
    category: z.enum(NOTIFICATION_CATEGORIES),
    channel: z.enum(USER_NOTIFICATION_CHANNELS),
    enabled: z.boolean(),
    digestMode: z.enum(["IMMEDIATE", "DAILY", "WEEKLY"]).default("IMMEDIATE"),
    quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  })).min(1).max(100),
});

const mandatoryByCategory: Partial<Record<NotificationCategory, NotificationChannel[]>> = {
  SECURITY: ["IN_APP", "EMAIL"],
  COMPLIANCE: ["IN_APP", "EMAIL"],
  BILLING: ["IN_APP"],
  ACCOUNT: ["IN_APP"],
  INCIDENT: ["IN_APP"],
};

export async function listNotificationPreferences(companyId: string, userId: string, timezone: string) {
  const stored = await prisma.notificationPreference.findMany({ where: { companyId, userId } });
  const byKey = new Map(stored.map((preference) => [`${preference.category}:${preference.channel}`, preference]));
  return NOTIFICATION_CATEGORIES.flatMap((category) => USER_NOTIFICATION_CHANNELS.map((channel) => {
    const preference = byKey.get(`${category}:${channel}`);
    const mandatoryLocked = mandatoryByCategory[category]?.includes(channel) ?? false;
    const defaultEnabled = channel === "IN_APP" || (category !== "MARKETING" && ["SECURITY", "COMPLIANCE"].includes(category) && channel === "EMAIL");
    return {
      category,
      channel,
      enabled: mandatoryLocked ? true : preference?.enabled ?? defaultEnabled,
      mandatoryLocked,
      digestMode: preference?.digestMode ?? "IMMEDIATE",
      quietHoursStart: preference?.quietHoursStart ?? null,
      quietHoursEnd: preference?.quietHoursEnd ?? null,
      timezone: preference?.timezone ?? timezone,
    };
  }));
}

export async function updateNotificationPreferences(input: {
  companyId: string;
  userId: string;
  timezone: string;
  preferences: z.infer<typeof notificationPreferencePatchSchema>["preferences"];
}) {
  for (const preference of input.preferences) {
    const mandatoryLocked = mandatoryByCategory[preference.category]?.includes(preference.channel) ?? false;
    if (mandatoryLocked && !preference.enabled) throw new Error("NOTIFICATION_CHANNEL_MANDATORY");
  }
  await prisma.$transaction(input.preferences.map((preference) => {
    const mandatoryLocked = mandatoryByCategory[preference.category]?.includes(preference.channel) ?? false;
    return prisma.notificationPreference.upsert({
      where: {
        companyId_userId_category_channel: {
          companyId: input.companyId,
          userId: input.userId,
          category: preference.category,
          channel: preference.channel,
        },
      },
      update: {
        enabled: mandatoryLocked ? true : preference.enabled,
        mandatoryLocked,
        digestMode: preference.digestMode,
        quietHoursStart: preference.quietHoursStart,
        quietHoursEnd: preference.quietHoursEnd,
        timezone: input.timezone,
      },
      create: {
        companyId: input.companyId,
        userId: input.userId,
        category: preference.category,
        channel: preference.channel,
        enabled: mandatoryLocked ? true : preference.enabled,
        mandatoryLocked,
        digestMode: preference.digestMode,
        quietHoursStart: preference.quietHoursStart,
        quietHoursEnd: preference.quietHoursEnd,
        timezone: input.timezone,
      },
    });
  }));
  return listNotificationPreferences(input.companyId, input.userId, input.timezone);
}
