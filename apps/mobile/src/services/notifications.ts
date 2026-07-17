import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import { registerMobileNotificationToken } from "@/api/mobileNotifications";
import { config } from "@/constants/config";
import { captureAppError } from "@/services/crash-reporting";
import { trackEvent } from "@/services/analytics";
import { getOrCreateDeviceId } from "@/storage/device-storage";

type PermissionLike = {
  granted?: boolean;
  status?: string;
};

type NotificationData = Record<string, unknown>;

const BACKGROUND_NOTIFICATION_TASK = "LOGIVYA_BACKGROUND_NOTIFICATION";
let notificationRuntimeConfigured = false;

export const LOGIVYA_NOTIFICATION_TYPES = {
  WHATSAPP_DISCONNECTED: "whatsapp.disconnected",
  WHATSAPP_CONNECTED: "whatsapp.connected",
  WHATSAPP_QR_EXPIRED: "whatsapp.qr_expired",
  WHATSAPP_ACCOUNT_ARCHIVED: "whatsapp.account_archived",
  WHATSAPP_ACCOUNT_DELETED: "whatsapp.account_deleted",
  SUBSCRIPTION_EXPIRING: "subscription.trial_ending",
  SUBSCRIPTION_EXPIRED: "subscription.trial_expired",
  SUPPORT_TICKET_UPDATE: "support.admin_replied",
  SUPPORT_TICKET_CREATED: "support.ticket_created",
  SUPPORT_ADMIN_NEW_TICKET: "support.admin_new_ticket",
  SUPPORT_USER_REPLIED: "support.user_replied",
  SUPPORT_STATUS_CHANGED: "support.status_changed",
  SUPPORT_TICKET_CLOSED: "support.ticket_closed",
  SUPPORT_TICKET_REOPENED: "support.ticket_reopened",
  CAMPAIGN_COMPLETED: "campaign.completed",
  CAMPAIGN_FAILED: "campaign.failed",
  CAMPAIGN_PARTIAL_DELIVERY: "campaign.partial_delivery"
} as const;

export function configureNotificationRuntime() {
  if (notificationRuntimeConfigured) return;
  notificationRuntimeConfigured = true;

  try {
    if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
        if (error) {
          captureAppError(error, { source: "background-notification-task" });
          return;
        }
        await trackEvent("push_background_received", { hasData: Boolean(data) });
      });
    }
  } catch (error) {
    captureAppError(error, { source: "background-notification-define" });
  }

  try {
    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((error) => {
      captureAppError(error, { source: "background-notification-registration" });
    });
  } catch (error) {
    captureAppError(error, { source: "background-notification-registration" });
  }

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true
      })
    });
  } catch (error) {
    captureAppError(error, { source: "notification-handler" });
  }
}

export async function requestNotificationPermissionAndRegister() {
  configureNotificationRuntime();

  if (!Device.isDevice) return { registered: false, reason: "physical-device-required" };

  const existing = (await Notifications.getPermissionsAsync()) as PermissionLike;
  let granted = existing.granted ?? existing.status === "granted";

  if (!granted) {
    const requested = (await Notifications.requestPermissionsAsync()) as PermissionLike;
    granted = requested.granted ?? requested.status === "granted";
  }

  if (!granted) {
    await trackEvent("push_permission_denied");
    return { registered: false, reason: "permission-denied" };
  }

  if (Platform.OS === "android") {
    await Promise.all([
      createAndroidChannel("system", "Sistem", Notifications.AndroidImportance.DEFAULT),
      createAndroidChannel("security", "Güvenlik", Notifications.AndroidImportance.HIGH),
      createAndroidChannel("account", "Hesap", Notifications.AndroidImportance.DEFAULT),
      createAndroidChannel("whatsapp", "WhatsApp bağlantısı", Notifications.AndroidImportance.HIGH),
      createAndroidChannel("messages", "Mesajlar", Notifications.AndroidImportance.DEFAULT),
      createAndroidChannel("support", "Destek", Notifications.AndroidImportance.DEFAULT),
      createAndroidChannel("billing", "Abonelik ve ödemeler", Notifications.AndroidImportance.HIGH)
    ]);
  }

  const token = await Notifications.getExpoPushTokenAsync(config.easProjectId ? { projectId: config.easProjectId } : undefined);
  const deviceId = await getOrCreateDeviceId();
  const platform = Platform.OS === "ios" ? "IOS" : Platform.OS === "android" ? "ANDROID" : "WEB";

  await registerMobileNotificationToken({
    token: token.data,
    deviceId,
    platform,
    ...(Device.osVersion ? { appVersion: Device.osVersion } : {})
  });

  await trackEvent("push_token_registered", { platform });
  return { registered: true };
}

export async function getNotificationPermissionStatus() {
  const permission = (await Notifications.getPermissionsAsync()) as PermissionLike;
  return permission.granted ?? permission.status === "granted";
}

export function subscribeNotificationHandlers(onOpen?: (url: string) => void) {
  configureNotificationRuntime();

  let foreground: { remove: () => void } | undefined;
  let response: { remove: () => void } | undefined;

  try {
    foreground = Notifications.addNotificationReceivedListener((notification) => {
      void trackEvent("push_foreground_received", {
        type: notification.request.content.data?.type
      });
    });
  } catch (error) {
    captureAppError(error, { source: "notification-foreground-subscribe" });
  }

  try {
    response = Notifications.addNotificationResponseReceivedListener((event) => {
      try {
        const url = getNotificationDeepLink(event.notification.request.content.data ?? {});
        if (typeof url === "string" && onOpen) onOpen(url);
        void trackEvent("push_opened", { url: typeof url === "string" ? url : undefined });
      } catch (error) {
        captureAppError(error, { source: "notification-open" });
      }
    });
  } catch (error) {
    captureAppError(error, { source: "notification-response-subscribe" });
  }

  return () => {
    try {
      foreground?.remove();
    } catch (error) {
      captureAppError(error, { source: "notification-foreground-unsubscribe" });
    }
    try {
      response?.remove();
    } catch (error) {
      captureAppError(error, { source: "notification-response-unsubscribe" });
    }
  };
}

function getNotificationDeepLink(data: NotificationData) {
  if (typeof data.url === "string" && isSafeNotificationDeepLink(data.url)) return data.url;
  if (typeof data.deepLink === "string" && isSafeNotificationDeepLink(data.deepLink)) return data.deepLink;

  switch (data.type) {
    case LOGIVYA_NOTIFICATION_TYPES.WHATSAPP_DISCONNECTED:
    case LOGIVYA_NOTIFICATION_TYPES.WHATSAPP_CONNECTED:
    case LOGIVYA_NOTIFICATION_TYPES.WHATSAPP_QR_EXPIRED:
    case LOGIVYA_NOTIFICATION_TYPES.WHATSAPP_ACCOUNT_ARCHIVED:
    case LOGIVYA_NOTIFICATION_TYPES.WHATSAPP_ACCOUNT_DELETED:
      return "logivya://whatsapp/accounts";
    case LOGIVYA_NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING:
    case LOGIVYA_NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
      return "logivya://profile/subscription";
    case LOGIVYA_NOTIFICATION_TYPES.SUPPORT_TICKET_UPDATE:
    case LOGIVYA_NOTIFICATION_TYPES.SUPPORT_TICKET_CREATED:
    case LOGIVYA_NOTIFICATION_TYPES.SUPPORT_STATUS_CHANGED:
    case LOGIVYA_NOTIFICATION_TYPES.SUPPORT_TICKET_CLOSED:
    case LOGIVYA_NOTIFICATION_TYPES.SUPPORT_TICKET_REOPENED: {
      const ticketId = typeof data.publicId === "string" ? data.publicId : data.ticketId;
      return typeof ticketId === "string" ? `logivya://support/tickets/${ticketId}` : "logivya://support";
    }
    case LOGIVYA_NOTIFICATION_TYPES.SUPPORT_ADMIN_NEW_TICKET:
    case LOGIVYA_NOTIFICATION_TYPES.SUPPORT_USER_REPLIED: {
      const ticketId = typeof data.publicId === "string" ? data.publicId : data.ticketId;
      return typeof ticketId === "string" ? `logivya://profile/admin/support/${ticketId}` : "logivya://profile/admin/support";
    }
    case LOGIVYA_NOTIFICATION_TYPES.CAMPAIGN_COMPLETED:
    case LOGIVYA_NOTIFICATION_TYPES.CAMPAIGN_FAILED:
    case LOGIVYA_NOTIFICATION_TYPES.CAMPAIGN_PARTIAL_DELIVERY:
      return "logivya://messages";
    default:
      return undefined;
  }
}

function createAndroidChannel(id: string, name: string, importance: Notifications.AndroidImportance) {
  return Notifications.setNotificationChannelAsync(id, {
    name,
    importance,
    vibrationPattern: [0, 250, 180, 250],
    enableVibrate: true
  });
}

function isSafeNotificationDeepLink(value: string) {
  return value.startsWith("logivya://") || /^https:\/\/(www\.)?logivya\.com(\/|$)/i.test(value);
}
