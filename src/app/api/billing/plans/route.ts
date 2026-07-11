import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { CORE_PLAN_CODES } from "@/server/billing/plan-matrix";
import { prisma } from "@/server/db";

export async function GET() {
  try {
    await requireApiSession();
    const plans = await prisma.plan.findMany({
      where: { isActive: true, slug: { in: [...CORE_PLAN_CODES] } },
    });
    plans.sort((left, right) => CORE_PLAN_CODES.indexOf(left.slug as (typeof CORE_PLAN_CODES)[number]) - CORE_PLAN_CODES.indexOf(right.slug as (typeof CORE_PLAN_CODES)[number]));
    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
}
