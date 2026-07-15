import { Prisma } from "@prisma/client";
import { translateForLocale } from "@/i18n/server";
import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

export const NOTIFICATION_TYPES = {
  WHATSAPP_CONNECTED: "whatsapp.connected",
  WHATSAPP_DISCONNECTED: "whatsapp.disconnected",
  WHATSAPP_QR_EXPIRED: "whatsapp.qr_expired",
  WHATSAPP_QR_CONNECTED: "whatsapp.qr_connected",
  WHATSAPP_PHONE_CODE_CONNECTED: "whatsapp.phone_code_connected",
  WHATSAPP_ACCOUNT_ARCHIVED: "whatsapp.account_archived",
  WHATSAPP_ACCOUNT_DELETED: "whatsapp.account_deleted",
  CAMPAIGN_COMPLETED: "campaign.completed",
  CAMPAIGN_FAILED: "campaign.failed",
  CAMPAIGN_PARTIAL_DELIVERY: "campaign.partial_delivery",
  CAMPAIGN_SCHEDULED_STARTED: "campaign.scheduled_started",
  CAMPAIGN_SCHEDULED_FINISHED: "campaign.scheduled_finished",
  SUBSCRIPTION_TRIAL_ENDING: "subscription.trial_ending",
  SUBSCRIPTION_TRIAL_EXPIRED: "subscription.trial_expired",
  SUBSCRIPTION_ACTIVATED: "subscription.activated",
  SUBSCRIPTION_RENEWED: "subscription.renewed",
  SUBSCRIPTION_CANCELLED: "subscription.cancelled",
  SUBSCRIPTION_PAYMENT_FAILED: "subscription.payment_failed",
  SUPPORT_TICKET_CREATED: "support.ticket_created",
  SUPPORT_ADMIN_NEW_TICKET: "support.admin_new_ticket",
  SUPPORT_ADMIN_REPLIED: "support.admin_replied",
  SUPPORT_USER_REPLIED: "support.user_replied",
  SUPPORT_STATUS_CHANGED: "support.status_changed",
  SUPPORT_TICKET_CLOSED: "support.ticket_closed",
  SUPPORT_TICKET_REOPENED: "support.ticket_reopened",
  ADMIN_COMPANY_REGISTERED: "admin.company_registered",
  ADMIN_PAYMENT_CREATED: "admin.payment_created",
  ADMIN_TRIAL_EXPIRING: "admin.trial_expiring",
  ADMIN_HIGH_PRIORITY_SUPPORT_TICKET: "admin.high_priority_support_ticket",
  ADMIN_WHATSAPP_ACCOUNT_FAILURE: "admin.whatsapp_account_failure"
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export type NotificationPayload = Record<string, unknown>;

type CreateNotificationInput = {
  companyId: string;
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  payload?: NotificationPayload;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_PREFIXES = ["ExponentPushToken[", "ExpoPushToken["];
const LEGACY_NOTIFICATION_TYPES = [
  "ACCOUNT_ARCHIVED",
  "PAYMENT_RECEIVED",
  "PAYMENT_REJECTED",
  "SUPPORT_REPLY",
  "SUBSCRIPTION_ACTIVATED",
  "SUBSCRIPTION_CANCELED",
  "SUBSCRIPTION_EXPIRED",
  "TRIAL_EXPIRED",
  "TRIAL_STARTED",
] as const;
const LOCALIZED_NOTIFICATION_TYPES = new Set<string>([...Object.values(NOTIFICATION_TYPES), ...LEGACY_NOTIFICATION_TYPES]);

function notificationVariables(payload?: NotificationPayload) {
  return Object.fromEntries(
    Object.entries(payload ?? {}).filter((entry): entry is [string, string | number] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number";
    }),
  );
}

async function localizedNotificationContent(input: Pick<CreateNotificationInput, "type" | "title" | "message" | "payload">, locale?: string | null) {
  if (!LOCALIZED_NOTIFICATION_TYPES.has(input.type)) {
    return { title: input.title, message: input.message };
  }

  const variables = notificationVariables(input.payload);
  const titleKey = `notification.title.${input.type}`;
  const messageKey = `notification.message.${input.type}`;
  const [title, message] = await Promise.all([
    translateForLocale(locale, titleKey, variables),
    translateForLocale(locale, messageKey, variables),
  ]);
  return {
    title: title === titleKey ? input.title : title,
    message: message === messageKey ? input.message : message,
  };
}

export async function localizeNotificationRecord<T extends { type: string; title: string; message: string; payload?: Prisma.JsonValue | null }>(notification: T, locale?: string | null) {
  const payload = notification.payload && typeof notification.payload === "object" && !Array.isArray(notification.payload)
    ? notification.payload as NotificationPayload
    : undefined;
  const content = await localizedNotificationContent({ ...notification, payload }, locale);
  return { ...notification, ...content };
}

export function serializeNotification(notification: {
  id: string;
  companyId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  payload?: Prisma.JsonValue | null;
  isRead: boolean;
  createdAt: Date;
}) {
  return {
    id: notification.id,
    tenantId: notification.companyId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    payload: notification.payload ?? null,
    read: notification.isRead,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString()
  };
}

export async function createNotification(input: CreateNotificationInput) {
  const recipient = await prisma.user.findUnique({ where: { id: input.userId }, select: { locale: true } });
  const content = await localizedNotificationContent(input, recipient?.locale);
  const notification = await prisma.notification.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      type: input.type,
      title: content.title,
      message: content.message,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue
    }
  });

  await sendPushToUser({
    companyId: input.companyId,
    userId: input.userId,
    title: content.title,
    message: content.message,
    type: input.type,
    notificationId: notification.id,
    payload: input.payload
  });

  return notification;
}

export async function createNotificationsForUsers(input: Omit<CreateNotificationInput, "userId"> & { userIds: string[] }) {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (!userIds.length) return [];

  const recipients = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, locale: true },
  });
  const recipientLocale = new Map(recipients.map((recipient) => [recipient.id, recipient.locale]));
  const localizedByUser = new Map(
    await Promise.all(userIds.map(async (userId) => [
      userId,
      await localizedNotificationContent(input, recipientLocale.get(userId)),
    ] as const)),
  );

  const notifications = await prisma.$transaction(
    userIds.map((userId) => {
      const content = localizedByUser.get(userId) ?? { title: input.title, message: input.message };
      return prisma.notification.create({
        data: {
          companyId: input.companyId,
          userId,
          type: input.type,
          title: content.title,
          message: content.message,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue
        }
      });
    })
  );

  await Promise.all(
    notifications.map((notification) =>
      sendPushToUser({
        companyId: input.companyId,
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        type: input.type,
        notificationId: notification.id,
        payload: input.payload
      })
    )
  );

  return notifications;
}

export async function notifyCompanyUsers(input: Omit<CreateNotificationInput, "userId">) {
  const members = await prisma.companyUser.findMany({
    where: { companyId: input.companyId, status: "ACTIVE" },
    select: { userId: true }
  });
  return createNotificationsForUsers({ ...input, userIds: members.map((member) => member.userId) });
}

export async function notifyPlatformAdmins(input: Omit<CreateNotificationInput, "userId">) {
  const owner = await prisma.user.findUnique({
    where: { email: LOGIVYA_PLATFORM_OWNER_EMAIL },
    select: { id: true }
  });
  return createNotificationsForUsers({ ...input, userIds: owner ? [owner.id] : [] });
}

async function sendPushToUser(input: {
  companyId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  notificationId: string;
  payload?: NotificationPayload;
}) {
  const devices = await prisma.mobilePushToken.findMany({
    where: { companyId: input.companyId, userId: input.userId, revokedAt: null },
    select: { id: true, token: true }
  });
  const tokens = devices.filter((device) => isExpoPushToken(device.token));
  if (!tokens.length) return;

  const messages = tokens.map((device) => ({
    to: device.token,
    sound: "default",
    title: input.title,
    body: input.message,
    data: {
      type: input.type,
      notificationId: input.notificationId,
      ...(input.payload ?? {})
    }
  }));

  for (const chunk of chunkArray(messages, 100)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(chunk)
      });
      if (!response.ok) {
        logger.error("notification.expo_push.failed", new Error("EXPO_PUSH_REJECTED"), { statusCode: response.status, userId: input.userId, notificationId: input.notificationId });
      }
    } catch (error) {
      logger.error("notification.expo_push.error", error, { userId: input.userId, notificationId: input.notificationId });
    }
  }
}

export async function sendPushToUserStrict(input: {
  companyId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  notificationId: string;
  payload?: NotificationPayload;
}) {
  const devices = await prisma.mobilePushToken.findMany({
    where: { companyId: input.companyId, userId: input.userId, revokedAt: null },
    select: { token: true },
  });
  const tokens = devices.filter((device) => isExpoPushToken(device.token));
  if (!tokens.length) return { delivered: 0, skipped: true };

  const messages = tokens.map((device) => ({
    to: device.token,
    sound: "default",
    title: input.title,
    body: input.message,
    data: {
      type: input.type,
      notificationId: input.notificationId,
      ...(input.payload ?? {}),
    },
  }));

  let delivered = 0;
  for (const chunk of chunkArray(messages, 100)) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) throw new Error(`EXPO_PUSH_${response.status}`);
    delivered += chunk.length;
  }

  return { delivered, skipped: false };
}

function isExpoPushToken(token: string) {
  return EXPO_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix)) && token.endsWith("]");
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
