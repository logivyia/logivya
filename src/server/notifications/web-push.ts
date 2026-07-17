import webPush, { type PushSubscription } from "web-push";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";
import { decryptPushToken } from "@/server/notifications/push-token-security";

type WebPushPayload = {
  title: string;
  message: string;
  notificationId: string;
  type: string;
  deepLink?: string;
};

export function getWebPushConfiguration() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:logivya@gmail.com";
  return {
    configured: Boolean(publicKey && privateKey && /^(mailto:|https:)/i.test(subject)),
    publicKey,
    privateKey,
    subject,
  };
}

export async function sendWebPushToUser(input: {
  companyId: string;
  userId: string;
  payload: WebPushPayload;
}) {
  const configuration = getWebPushConfiguration();
  if (!configuration.configured) throw new Error("NOTIFICATION_PROVIDER_UNAVAILABLE_WEB_PUSH");
  webPush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);

  const devices = await prisma.mobilePushToken.findMany({
    where: { companyId: input.companyId, userId: input.userId, platform: "WEB", revokedAt: null },
    select: { id: true, token: true },
  });
  if (!devices.length) return { delivered: 0, skipped: true, providerMessageId: undefined as string | undefined, invalidatedTokens: 0 };

  let delivered = 0;
  const invalidTokenIds: string[] = [];
  let providerMessageId: string | undefined;
  for (const device of devices) {
    try {
      const subscription = parseSubscription(decryptPushToken(device.token));
      const result = await webPush.sendNotification(subscription, JSON.stringify(input.payload), {
        TTL: 24 * 60 * 60,
        urgency: input.payload.type.startsWith("security.") || input.payload.type.startsWith("account.") ? "high" : "normal",
        topic: input.payload.type.slice(0, 32),
      });
      delivered += 1;
      providerMessageId ||= result.headers.location || result.headers["x-request-id"];
    } catch (error) {
      const statusCode = webPushStatusCode(error);
      if (statusCode === 404 || statusCode === 410) {
        invalidTokenIds.push(device.id);
        continue;
      }
      logger.error("notification.web_push.failed", error, { pushTokenId: device.id, userId: input.userId, statusCode });
      throw new Error(statusCode ? `WEB_PUSH_${statusCode}` : "NOTIFICATION_DELIVERY_FAILED_WEB_PUSH");
    }
  }

  if (invalidTokenIds.length) await invalidateWebPushTokens(invalidTokenIds);
  if (!delivered && invalidTokenIds.length === devices.length) throw new Error("NOTIFICATION_DEVICE_TOKEN_INVALID");
  return { delivered, skipped: false, providerMessageId, invalidatedTokens: invalidTokenIds.length };
}

function parseSubscription(value: string): PushSubscription {
  try {
    const parsed = JSON.parse(value) as Partial<PushSubscription>;
    if (!parsed.endpoint || !parsed.keys?.auth || !parsed.keys?.p256dh) throw new Error("INVALID");
    return parsed as PushSubscription;
  } catch {
    throw new Error("NOTIFICATION_DEVICE_TOKEN_INVALID");
  }
}

async function invalidateWebPushTokens(ids: string[]) {
  const invalidatedAt = new Date();
  await prisma.$transaction([
    prisma.mobilePushToken.updateMany({ where: { id: { in: ids } }, data: { revokedAt: invalidatedAt } }),
    prisma.notificationDevice.updateMany({ where: { mobilePushTokenId: { in: ids } }, data: { enabled: false, invalidatedAt } }),
  ]);
}

function webPushStatusCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { statusCode?: unknown };
  return typeof value.statusCode === "number" ? value.statusCode : undefined;
}
