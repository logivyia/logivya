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
  CAMPAIGN_COMPLETED: "campaign.completed",
  CAMPAIGN_FAILED: "campaign.failed",
  CAMPAIGN_PARTIAL_DELIVERY: "campaign.partial_delivery"
} as const;

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    captureAppError(error, { source: "background-notification-task" });
    return;
  }
  await trackEvent("push_background_received", { hasData: Boolean(data) });
});

Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((error) => {
  captureAppError(error, { source: "background-notification-registration" });
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function requestNotificationPermissionAndRegister() {
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
    await Notifications.setNotificationChannelAsync("default", {
      name: "Logivya",
      importance: Notifications.AndroidImportance.DEFAULT
    });
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

export function subscribeNotificationHandlers(onOpen?: (url: string) => void) {
  const foreground = Notifications.addNotificationReceivedListener((notification) => {
    void trackEvent("push_foreground_received", {
      type: notification.request.content.data?.type
    });
  });

  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    try {
      const url = getNotificationDeepLink(event.notification.request.content.data ?? {});
      if (typeof url === "string" && onOpen) onOpen(url);
      void trackEvent("push_opened", { url: typeof url === "string" ? url : undefined });
    } catch (error) {
      captureAppError(error, { source: "notification-open" });
    }
  });

  return () => {
    foreground.remove();
    response.remove();
  };
}

function getNotificationDeepLink(data: NotificationData) {
  if (typeof data.url === "string") return data.url;

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
      return typeof data.ticketId === "string" ? `logivya://support/tickets/${data.ticketId}` : "logivya://support";
    case LOGIVYA_NOTIFICATION_TYPES.CAMPAIGN_COMPLETED:
    case LOGIVYA_NOTIFICATION_TYPES.CAMPAIGN_FAILED:
    case LOGIVYA_NOTIFICATION_TYPES.CAMPAIGN_PARTIAL_DELIVERY:
      return "logivya://messages";
    default:
      return undefined;
  }
}
