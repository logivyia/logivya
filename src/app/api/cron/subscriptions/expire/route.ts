import { NextResponse } from "next/server";
import { expireDueSubscriptions } from "@/server/billing/subscription-expiration";
import { isInternalJobAuthorized } from "@/server/security/internal-job-auth";
import { logger } from "@/server/observability/logger";

export async function POST(request: Request) {
  if (!isInternalJobAuthorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const result = await expireDueSubscriptions();
  logger.info("subscriptions.expiration_completed", result);
  return NextResponse.json({ ok: true, ...result });
}
