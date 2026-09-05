import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { assertSubscriptionRequestCsrf } from "@/server/billing/subscription-request-security";

export async function POST(request: Request) {
  try {
    assertSubscriptionRequestCsrf(request);
    await requireApiSession();
    return NextResponse.json({
      error: "SUBSCRIPTION_REQUEST_FLOW_REQUIRED",
      message: "Abonelik talebi oluşturmak için ödeme bilgileri ve sözleşme onayı adımlarını tamamlayın.",
    }, { status: 409 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SUBSCRIPTION_REQUEST_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "CSRF_REJECTED" ? 403 : 500;
    return NextResponse.json({
      error: status === 500 ? "SUBSCRIPTION_REQUEST_FAILED" : code,
    }, { status });
  }
}
