import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSupportSuperAdmin } from "@/server/support";
import { supportErrorResponse } from "@/server/support/errors";
import {
  processSupportNotificationOutbox,
  retryFailedSupportNotifications,
} from "@/server/support/notifications";

const schema = z.object({ limit: z.number().int().min(1).max(500).optional() });

export async function POST(request: Request) {
  try {
    await requireSupportSuperAdmin(request, "update");
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "SUPPORT_VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const retried = await retryFailedSupportNotifications(parsed.data.limit ?? 100);
    const processed = await processSupportNotificationOutbox(Math.min(retried.queued, 50));
    return NextResponse.json({ ok: true, ...retried, processed });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_NOTIFICATION_RETRY_FAILED");
  }
}
