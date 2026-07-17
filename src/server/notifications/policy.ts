import type { NotificationCategory, NotificationChannel, NotificationPriority } from "@prisma/client";

export type NotificationPreferencePolicy = {
  channel: NotificationChannel;
  enabled: boolean;
  digestMode?: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone?: string;
};

export type NotificationFrequencyRecord = {
  id: string;
  type: string;
  category: NotificationCategory;
  collapseKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastCollapsedAt: Date | null;
};

export type NotificationFrequencyDecision =
  | { action: "DELIVER" }
  | { action: "COLLAPSE"; notificationId: string }
  | { action: "RATE_LIMIT" };

export function resolveNotificationChannels(
  defaults: NotificationChannel[],
  mandatory: NotificationChannel[],
  preferences: NotificationPreferencePolicy[],
) {
  const preferenceByChannel = new Map(preferences.map((preference) => [preference.channel, preference.enabled]));
  return [...new Set([...defaults, ...mandatory])].filter((channel) => mandatory.includes(channel) || preferenceByChannel.get(channel) !== false);
}

export function notificationDeliveryAvailableAt(
  channel: NotificationChannel,
  preferences: NotificationPreferencePolicy[],
  scheduledAt?: Date,
  now = new Date(),
) {
  let availableAt = scheduledAt && scheduledAt > now ? scheduledAt : now;
  const preference = preferences.find((item) => item.channel === channel);
  if (!preference || channel === "IN_APP") return availableAt;
  const timezone = safeTimezone(preference.timezone);
  if (preference.digestMode === "DAILY") availableAt = nextDigestAt(availableAt, timezone, false);
  if (preference.digestMode === "WEEKLY") availableAt = nextDigestAt(availableAt, timezone, true);
  if (preference.quietHoursStart && preference.quietHoursEnd) {
    availableAt = afterQuietHours(availableAt, timezone, preference.quietHoursStart, preference.quietHoursEnd);
  }
  return availableAt;
}

export function notificationBackoffMs(attempt: number) {
  return Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

export function notificationFrequencyDecision(input: {
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  collapseKey?: string;
  mandatory: boolean;
  recent: NotificationFrequencyRecord[];
  now?: Date;
}): NotificationFrequencyDecision {
  if (input.priority === "CRITICAL" || input.mandatory) return { action: "DELIVER" };
  const now = input.now ?? new Date();
  const collapseKey = input.collapseKey?.trim() || input.type;
  const cooldownMs = input.type === "whatsapp.reconnecting" ? 10 * 60_000
    : input.category === "MARKETING" ? 24 * 60 * 60_000
      : 60_000;
  const collapsible = input.recent
    .filter((item) => (item.collapseKey || item.type) === collapseKey)
    .sort((left, right) => frequencyTimestamp(right).getTime() - frequencyTimestamp(left).getTime())[0];
  if (collapsible && now.getTime() - frequencyTimestamp(collapsible).getTime() < cooldownMs) {
    return { action: "COLLAPSE", notificationId: collapsible.id };
  }

  const windowMs = input.category === "MARKETING" ? 24 * 60 * 60_000 : 60 * 60_000;
  const limit = input.category === "MARKETING" ? 3 : 30;
  const categoryCount = input.recent.filter((item) => item.category === input.category && now.getTime() - item.createdAt.getTime() < windowMs).length;
  return categoryCount >= limit ? { action: "RATE_LIMIT" } : { action: "DELIVER" };
}

export function isRetryableNotificationError(errorCode: string) {
  const permanent = [
    "EMAIL_TEMPLATE_VARIABLES_MISSING",
    "NOTIFICATION_TEMPLATE_VARIABLES_MISSING",
    "NOTIFICATION_OUTBOX_PAYLOAD_INVALID",
    "NOTIFICATION_CONTENT_MISSING",
    "NOTIFICATION_CONTENT_INVALID",
    "NOTIFICATION_RECIPIENT_NOT_FOUND",
    "NOTIFICATION_RECIPIENT_TENANT_MISMATCH",
    "NOTIFICATION_DEEP_LINK_INVALID",
  ];
  return !permanent.some((code) => errorCode.startsWith(code));
}

export function isSafeNotificationDeepLink(value: string) {
  return (value.startsWith("/") && !value.startsWith("//"))
    || value.startsWith("logivya://")
    || /^https:\/\/(www\.)?logivya\.com(\/|$)/i.test(value);
}

export function isValidNotificationAudienceRequest(input: { audience: string; companyId?: string; userIds?: string[] }) {
  if (input.audience === "COMPANY_USERS") return Boolean(input.companyId);
  if (input.audience === "USER") return Boolean(input.userIds?.length && input.userIds.length <= 500);
  return input.audience === "PLATFORM_ADMIN" || input.audience === "PLATFORM_ALL_USERS";
}

function safeTimezone(timezone?: string) {
  const value = timezone || "Europe/Istanbul";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "Europe/Istanbul";
  }
}

function frequencyTimestamp(record: NotificationFrequencyRecord) {
  return record.lastCollapsedAt ?? record.updatedAt ?? record.createdAt;
}

function localClock(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function nextDigestAt(date: Date, timezone: string, weekly: boolean) {
  const clock = localClock(date, timezone);
  const targetMinutes = 9 * 60;
  let deltaMinutes: number;
  if (!weekly) {
    deltaMinutes = (targetMinutes - clock.minutes + 24 * 60) % (24 * 60);
    if (deltaMinutes === 0) deltaMinutes = 24 * 60;
  } else {
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(clock.weekday);
    let days = (1 - Math.max(0, weekday) + 7) % 7;
    if (days === 0 && clock.minutes >= targetMinutes) days = 7;
    deltaMinutes = days * 24 * 60 + targetMinutes - clock.minutes;
  }
  return new Date(date.getTime() + deltaMinutes * 60_000);
}

function afterQuietHours(date: Date, timezone: string, start: string, end: string) {
  const parse = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const startMinutes = parse(start);
  const endMinutes = parse(end);
  const currentMinutes = localClock(date, timezone).minutes;
  const inside = startMinutes < endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes;
  if (!inside) return date;
  const deltaMinutes = currentMinutes < endMinutes ? endMinutes - currentMinutes : 24 * 60 - currentMinutes + endMinutes;
  return new Date(date.getTime() + deltaMinutes * 60_000);
}
