import { Prisma } from "@prisma/client";
import { LOGIVYA_PLATFORM_OWNER_EMAIL } from "@/server/auth/platform-owner";
import { prisma } from "@/server/db";

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
  SUPPORT_ADMIN_REPLIED: "support.admin_replied",
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
  const notification = await prisma.notification.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue
    }
  });

  await sendPushToUser({
    companyId: input.companyId,
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type,
    notificationId: notification.id,
    payload: input.payload
  });

  return notification;
}

export async function createNotificationsForUsers(input: Omit<CreateNotificationInput, "userId"> & { userIds: string[] }) {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (!userIds.length) return [];

  const notifications = await prisma.$transaction(
    userIds.map((userId) =>
      prisma.notification.create({
        data: {
          companyId: input.companyId,
          userId,
          type: input.type,
          title: input.title,
          message: input.message,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue
        }
      })
    )
  );

  await Promise.all(
    notifications.map((notification) =>
      sendPushToUser({
        companyId: input.companyId,
        userId: notification.userId,
        title: input.title,
        message: input.message,
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
        console.error("expo.push.failed", { status: response.status, userId: input.userId, notificationId: input.notificationId });
      }
    } catch (error) {
      console.error("expo.push.error", { error: error instanceof Error ? error.message : String(error), userId: input.userId, notificationId: input.notificationId });
    }
  }
}

function isExpoPushToken(token: string) {
  return EXPO_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix)) && token.endsWith("]");
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
