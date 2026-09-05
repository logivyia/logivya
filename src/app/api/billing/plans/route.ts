import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { getNormalizedPlanCatalog } from "@/server/billing/plan-catalog";

export async function GET() {
  try {
    await requireApiSession();
    const plans = await getNormalizedPlanCatalog();
    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
