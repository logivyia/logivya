import { z } from "zod";

import {
  assertGooglePlayNotificationSecret,
  googlePlaySubscriptionErrorStatus,
  processGooglePlayDeveloperNotification,
} from "@/server/billing/google-play-subscriptions";
import { logger } from "@/server/observability/logger";
import { requestCorrelationId } from "@/server/observability/request-id";

export const runtime = "nodejs";

const schema = z.object({
  message: z.object({
    data: z.string().min(1).max(500_000),
    messageId: z.string().min(1).max(500),
    publishTime: z.string().max(100).optional(),
  }),
  subscription: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    assertGooglePlayNotificationSecret(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
    return Response.json(
      await processGooglePlayDeveloperNotification(parsed.data, correlationId),
    );
  } catch (error) {
    const status = googlePlaySubscriptionErrorStatus(error);
    logger.error("GOOGLE_PLAY_DEVELOPER_NOTIFICATION_FAILED", error, {
      correlationId,
      status,
    });
    return Response.json({ ok: false }, { status });
  }
}
