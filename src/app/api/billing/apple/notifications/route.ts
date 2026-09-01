import { z } from "zod";

import { processAppleServerNotification } from "@/server/billing/apple-subscriptions";
import { logger } from "@/server/observability/logger";

export const runtime = "nodejs";

const schema = z.object({ signedPayload: z.string().min(100).max(250_000) });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
    const result = await processAppleServerNotification(parsed.data.signedPayload);
    return Response.json(result);
  } catch (error) {
    logger.error("APPLE_SERVER_NOTIFICATION_FAILED", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
