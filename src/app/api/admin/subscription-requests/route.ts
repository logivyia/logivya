import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import {
  listManualSubscriptionRequestsForAdmin,
  manualSubscriptionRequestErrorBody,
  manualSubscriptionRequestStatus,
} from "@/server/billing/manual-subscription-requests";
import { requestId, safeAdminError } from "@/server/security/admin-request";

export const dynamic = "force-dynamic";

const statusSchema = z.enum([
  "DRAFT",
  "AWAITING_PAYMENT",
  "UNDER_REVIEW",
  "APPROVED",
  "ACTIVATED",
  "CLARIFICATION_REQUIRED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
]);

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    await requirePlatformAdmin("admin.billing.read", request);
    const params = new URL(request.url).searchParams;
    const parsedStatus = statusSchema.safeParse(params.get("status")?.toUpperCase());
    const requests = await listManualSubscriptionRequestsForAdmin({
      status: parsedStatus.success ? parsedStatus.data : undefined,
      query: params.get("q") || undefined,
    });
    return NextResponse.json(
      { requests, requestId: id },
      { headers: { "Cache-Control": "private, no-store", "X-Request-Id": id } },
    );
  } catch (error) {
    const domainStatus = manualSubscriptionRequestStatus(error);
    if (domainStatus !== 500) {
      return NextResponse.json(
        { ...manualSubscriptionRequestErrorBody(error), requestId: id },
        { status: domainStatus, headers: { "X-Request-Id": id } },
      );
    }
    const safe = safeAdminError(error, id);
    return NextResponse.json(safe.body, {
      status: safe.status,
      headers: { "X-Request-Id": id },
    });
  }
}
