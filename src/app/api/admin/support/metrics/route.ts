import { NextResponse } from "next/server";
import { requireSupportSuperAdmin } from "@/server/support";
import { getAdminSupportMetrics } from "@/server/support/service";
import { supportErrorResponse } from "@/server/support/errors";

export async function GET(request: Request) {
  try {
    await requireSupportSuperAdmin(request);
    return NextResponse.json({ metrics: await getAdminSupportMetrics() });
  } catch (error) {
    return supportErrorResponse(error, "SUPPORT_METRICS_FAILED");
  }
}
