import { Prisma, type NotificationStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { logger } from "@/server/observability/logger";

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

type Receipt = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

type DeliveryMetadata = {
  ticketIds?: string[];
  ticketDeviceMap?: Record<string, string>;
  [key: string]: unknown;
};

export async function processExpoPushReceipts(limit = 250) {
  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      provider: "expo",
      status: { in: ["SENT", "ACCEPTED"] },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000), lte: new Date(Date.now() - 15_000) },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(1_000, Math.max(1, limit)),
    select: { id: true, providerMetadata: true },
  });
  const ticketToDelivery = new Map<string, { deliveryId: string; deviceId?: string }>();
  for (const delivery of deliveries) {
    const metadata = asMetadata(delivery.providerMetadata);
    for (const ticketId of metadata.ticketIds ?? []) {
      ticketToDelivery.set(ticketId, { deliveryId: delivery.id, deviceId: metadata.ticketDeviceMap?.[ticketId] });
    }
  }
  const ticketIds = [...ticketToDelivery.keys()].slice(0, Math.min(1_000, Math.max(1, limit)));
  if (!ticketIds.length) return { requested: 0, delivered: 0, failed: 0, pending: 0, invalidatedTokens: 0 };

  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify({ ids: ticketIds }),
  });
  if (!response.ok) throw new Error(`EXPO_RECEIPTS_${response.status}`);
  const body = await response.json().catch(() => null) as { data?: Record<string, Receipt> } | null;
  const receipts = body?.data ?? {};
  let delivered = 0;
  let failed = 0;
  let pending = 0;
  const invalidTokenIds = new Set<string>();
  const outcomes = new Map<string, { delivered: number; failed: number; pending: number; errors: string[] }>();

  for (const ticketId of ticketIds) {
    const target = ticketToDelivery.get(ticketId)!;
    const outcome = outcomes.get(target.deliveryId) ?? { delivered: 0, failed: 0, pending: 0, errors: [] };
    const receipt = receipts[ticketId];
    if (!receipt) {
      outcome.pending += 1;
      pending += 1;
      outcomes.set(target.deliveryId, outcome);
      continue;
    }
    if (receipt.status === "ok") {
      outcome.delivered += 1;
      delivered += 1;
    } else {
      outcome.failed += 1;
      outcome.errors.push(safeReceiptError(receipt));
      failed += 1;
    }
    outcomes.set(target.deliveryId, outcome);
    if (receipt.details?.error === "DeviceNotRegistered" && target.deviceId) invalidTokenIds.add(target.deviceId);
  }

  for (const delivery of deliveries) {
    const outcome = outcomes.get(delivery.id);
    if (!outcome) continue;
    const status: NotificationStatus = outcome.pending > 0
      ? "ACCEPTED"
      : outcome.delivered > 0
        ? "DELIVERED"
        : "FAILED";
    const metadata = asMetadata(delivery.providerMetadata);
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        deliveredAt: status === "DELIVERED" ? new Date() : undefined,
        failedAt: status === "FAILED" ? new Date() : undefined,
        lastErrorCode: status === "FAILED" ? outcome.errors[0] || "EXPO_PUSH_DELIVERY_FAILED" : null,
        providerMetadata: { ...metadata, receiptSummary: outcome } as Prisma.InputJsonValue,
      },
    });
  }

  if (invalidTokenIds.size) {
    const invalidatedAt = new Date();
    const ids = [...invalidTokenIds];
    await prisma.$transaction([
      prisma.mobilePushToken.updateMany({ where: { id: { in: ids } }, data: { revokedAt: invalidatedAt } }),
      prisma.notificationDevice.updateMany({ where: { mobilePushTokenId: { in: ids } }, data: { enabled: false, invalidatedAt } }),
    ]);
  }
  logger.info("notification.expo_receipts.processed", { requested: ticketIds.length, delivered, failed, pending, invalidatedTokens: invalidTokenIds.size });
  return { requested: ticketIds.length, delivered, failed, pending, invalidatedTokens: invalidTokenIds.size };
}

function asMetadata(value: Prisma.JsonValue | null): DeliveryMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DeliveryMetadata : {};
}

function expoHeaders() {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function safeReceiptError(receipt: Receipt) {
  const raw = receipt.details?.error || receipt.message || "EXPO_PUSH_DELIVERY_FAILED";
  return raw.replace(/[^A-Z0-9_.:-]/gi, "_").slice(0, 160).toUpperCase();
}
