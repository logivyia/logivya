import { createHash } from "node:crypto";
import { type NotificationAudience, type NotificationChannel, type NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { isSafeNotificationDeepLink } from "@/server/notifications/policy";

export const announcementBaseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2_000),
  audience: z.enum(["PLATFORM_ALL_USERS", "COMPANY_USERS"]).default("PLATFORM_ALL_USERS"),
  companyId: z.string().min(1).optional(),
  locale: z.string().trim().min(2).max(8).default("tr"),
  channels: z.array(z.enum(["IN_APP", "EMAIL", "ANDROID_PUSH", "WEB_PUSH"])).min(1).max(4),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  deepLink: z.string().trim().max(500).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export const announcementInputSchema = announcementBaseSchema.superRefine((value, context) => {
  if (value.audience === "COMPANY_USERS" && !value.companyId) context.addIssue({ code: "custom", path: ["companyId"], message: "NOTIFICATION_COMPANY_REQUIRED" });
  if (value.deepLink && !isSafeNotificationDeepLink(value.deepLink)) context.addIssue({ code: "custom", path: ["deepLink"], message: "NOTIFICATION_DEEP_LINK_INVALID" });
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "NOTIFICATION_ANNOUNCEMENT_END_INVALID" });
});

export type AnnouncementPreviewInput = {
  title: string;
  body: string;
  audience: NotificationAudience;
  companyId?: string | null;
  locale: string;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  deepLink?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
};

export function announcementPreviewHash(input: AnnouncementPreviewInput) {
  return createHash("sha256").update(JSON.stringify({
    title: input.title,
    body: input.body,
    audience: input.audience,
    companyId: input.companyId || null,
    locale: input.locale,
    channels: [...input.channels].sort(),
    priority: input.priority,
    deepLink: input.deepLink || null,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt?.toISOString() || null,
  })).digest("hex");
}

export function announcementPreview(announcement: AnnouncementPreviewInput, recipientCount: number) {
  return {
    title: announcement.title,
    body: announcement.body,
    audience: announcement.audience,
    recipientCount,
    locale: announcement.locale,
    channels: announcement.channels,
    priority: announcement.priority,
    deepLink: announcement.deepLink || null,
    startsAt: announcement.startsAt.toISOString(),
    endsAt: announcement.endsAt?.toISOString() || null,
    confirmation: `PUBLISH ${recipientCount}`,
  };
}
